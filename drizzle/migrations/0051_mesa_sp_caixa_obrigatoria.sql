-- MESA-SP-CAIXA-OBRIGATORIA (03/11/2026, SHP-1586)
CREATE OR REPLACE FUNCTION public.fn_mesa_sp_caixa_dim_valida(p_dim jsonb)
 RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $f$
DECLARE c numeric; l numeric; a numeric;
BEGIN
  IF p_dim IS NULL OR jsonb_typeof(p_dim) <> 'object' THEN RETURN NULL; END IF;
  BEGIN
    c := (p_dim->>'comprimento_cm')::numeric; l := (p_dim->>'largura_cm')::numeric; a := (p_dim->>'altura_cm')::numeric;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Medidas da caixa avulsa inválidas (use números em cm).'; END;
  IF coalesce(c,0) <= 0 OR coalesce(l,0) <= 0 OR coalesce(a,0) <= 0 THEN
    RAISE EXCEPTION 'Caixa avulsa: comprimento, largura e altura devem ser maiores que zero.';
  END IF;
  IF c > 200 OR l > 200 OR a > 200 THEN RAISE EXCEPTION 'Caixa avulsa: medida acima de 200 cm — confira.'; END IF;
  RETURN jsonb_build_object('comprimento_cm', c, 'largura_cm', l, 'altura_cm', a);
END $f$;
GRANT EXECUTE ON FUNCTION public.fn_mesa_sp_caixa_dim_valida(jsonb) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.fn_mesa_sp_embalar(uuid,numeric,integer,text);
DROP FUNCTION IF EXISTS public.fn_mesa_sp_embalar(uuid,numeric,integer,text,jsonb);
DROP FUNCTION IF EXISTS public.fn_mesa_sp_embalar(uuid,numeric,integer,text,jsonb,text);

CREATE OR REPLACE FUNCTION public.fn_mesa_sp_embalar(p_pedido_id uuid, p_peso_kg numeric, p_volumes integer, p_modal text, p_checklist jsonb DEFAULT NULL::jsonb, p_caixa_codigo text DEFAULT NULL::text, p_caixa_dim jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- MESA-SP-CAIXA-APRENDE (28/10/2026): o evento mesa_embalado guarda a sugestão do sistema ao lado da escolha do operador (fn_mesa_sp_caixa_aprende), para recalibrar a regra de caixa. Falha no cálculo nunca bloqueia a embalagem.
DECLARE
  v_estagio text;
  v_faltando text;
  v_caixa record;
  v_marcados jsonb;
  v_sug text;
  v_dim jsonb;
BEGIN
  PERFORM set_config('sncf.mesa_sp', 'on', true);
  PERFORM public.fn_mesa_sp_trava_cancelamento(p_pedido_id);
  SELECT estagio INTO v_estagio FROM pedidos WHERE id = p_pedido_id;
  IF v_estagio <> 'em_separacao' THEN RAISE EXCEPTION 'Embalagem só em separação (pedido em "%").', coalesce(v_estagio,'?'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pedido_eventos e WHERE e.pedido_id=p_pedido_id AND e.tipo_evento='mesa_conferencia_ok') THEN
    RAISE EXCEPTION 'Embalagem exige conferência OK registrada.';
  END IF;
  IF p_peso_kg IS NULL OR p_peso_kg <= 0 THEN RAISE EXCEPTION 'Peso real obrigatório (PESO-REAL).'; END IF;
  IF coalesce(p_volumes,0) < 1 THEN RAISE EXCEPTION 'Quantidade de volumes inválida.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM b2c_modal_entrega m WHERE m.codigo=p_modal AND m.ativo) THEN
    RAISE EXCEPTION 'Modal "%" inexistente ou inativo (dimensão b2c_modal_entrega).', p_modal;
  END IF;

  v_sug := public.fn_mesa_sp_modal_sugerido(p_pedido_id)->>'modal';
  IF v_sug IS NOT NULL AND v_sug <> p_modal AND NOT EXISTS (
       SELECT 1 FROM pedido_eventos e WHERE e.pedido_id = p_pedido_id AND e.tipo_evento = 'mesa_modal_trocado'
          AND e.metadata->>'para' = p_modal
          AND e.criado_em > coalesce((SELECT max(criado_em) FROM pedido_eventos WHERE pedido_id = p_pedido_id AND tipo_evento = 'mesa_separacao_iniciada'), '-infinity')) THEN
    RAISE EXCEPTION 'O modal do pedido é %. Para embalar como %, registre o motivo da troca.', v_sug, p_modal;
  END IF;

  SELECT string_agg(c.rotulo, ' · ' ORDER BY c.ordem) INTO v_faltando
    FROM b2c_embalagem_checklist c
   WHERE c.modal_codigo = p_modal AND c.ativo AND c.obrigatorio
     AND NOT EXISTS (SELECT 1 FROM b2c_embalagem_marcacao m
                      WHERE m.pedido_id = p_pedido_id AND m.item_id = c.id);
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'Rotina de embalagem incompleta para %: %', p_modal, v_faltando;
  END IF;

  IF p_caixa_codigo IS NOT NULL THEN
    SELECT * INTO v_caixa FROM b2c_embalagem_caixa WHERE codigo = p_caixa_codigo AND ativo;
    IF v_caixa.codigo IS NULL THEN
      RAISE EXCEPTION 'Caixa "%" inexistente ou inativa (dimensão b2c_embalagem_caixa).', p_caixa_codigo;
    END IF;
  END IF;

  -- MESA-SP-CAIXA-OBRIGATORIA (03/11/2026): Correios exige caixa (cadastro ou avulsa com medidas).
  v_dim := public.fn_mesa_sp_caixa_dim_valida(p_caixa_dim);
  IF p_caixa_codigo IS NOT NULL THEN v_dim := NULL; END IF;
  IF p_modal = 'CORREIOS' AND p_caixa_codigo IS NULL AND v_dim IS NULL THEN
    RAISE EXCEPTION 'Correios exige a caixa usada (do cadastro ou medidas da caixa avulsa)';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'rotulo', c.rotulo, 'marcado_em', m.marcado_em, 'marcado_por', m.marcado_por
         ) ORDER BY c.ordem), '[]'::jsonb)
    INTO v_marcados
    FROM b2c_embalagem_marcacao m
    JOIN b2c_embalagem_checklist c ON c.id = m.item_id
   WHERE m.pedido_id = p_pedido_id;

  INSERT INTO pedido_eventos (pedido_id, tipo_evento, descricao, metadata, automatico, ator_tipo, ator_origem)
  VALUES (p_pedido_id, 'mesa_embalado',
          format('Mesa SP: embalado — %s vol, %s kg, modal %s%s.', p_volumes, p_peso_kg, p_modal,
                 CASE WHEN p_caixa_codigo IS NOT NULL THEN ', caixa '||p_caixa_codigo
                      WHEN v_dim IS NOT NULL THEN format(', caixa avulsa %sx%sx%s cm', v_dim->>'comprimento_cm', v_dim->>'largura_cm', v_dim->>'altura_cm') ELSE '' END),
          jsonb_build_object('peso_kg',p_peso_kg,'volumes',p_volumes,'modal',p_modal,'modal_sugerido',v_sug,
                             'caixa', p_caixa_codigo, 'caixa_dim', v_dim, 'rotina', v_marcados, 'auth_uid',auth.uid()) || public.fn_mesa_sp_caixa_aprende(p_pedido_id, p_caixa_codigo, p_volumes),
          false, 'humano', 'mesa_sp');

  DELETE FROM b2c_embalagem_marcacao WHERE pedido_id = p_pedido_id;

  IF EXISTS (SELECT 1 FROM pedidos WHERE id = p_pedido_id AND canal = 'B2B') THEN
    PERFORM public.transicionar_pedido(p_pedido_id, 'pre_faturamento', NULL,
      format('Mesa SP: embalado (%s vol, %s kg) — pronto para faturar (NF da matriz SP)', p_volumes, p_peso_kg), false);
    RETURN jsonb_build_object('ok', true, 'caixa', p_caixa_codigo, 'estagio', 'pre_faturamento');
  END IF;
  RETURN jsonb_build_object('ok', true, 'caixa', p_caixa_codigo);
END $function$;
REVOKE ALL ON FUNCTION public.fn_mesa_sp_embalar(uuid,numeric,integer,text,jsonb,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_mesa_sp_embalar(uuid,numeric,integer,text,jsonb,text,jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_mesa_sp_corrigir_caixa(p_pedido_id uuid, p_caixa_codigo text DEFAULT NULL, p_caixa_dim jsonb DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$
DECLARE v_ult record; v_dim jsonb; m jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão obrigatória.'; END IF;
  PERFORM set_config('sncf.mesa_sp', 'on', true);
  PERFORM public.fn_mesa_sp_trava_cancelamento(p_pedido_id);
  SELECT * INTO v_ult FROM pedido_eventos WHERE pedido_id = p_pedido_id AND tipo_evento = 'mesa_embalado' ORDER BY criado_em DESC LIMIT 1;
  IF v_ult.id IS NULL THEN RAISE EXCEPTION 'Pedido sem embalagem registrada — embale pela estação Embalagem.'; END IF;
  IF EXISTS (SELECT 1 FROM correios_prepostagem WHERE pedido_id = p_pedido_id AND status <> 'cancelada') THEN
    RAISE EXCEPTION 'Já existe etiqueta Correios viva para este pedido — cancele antes de corrigir a caixa.';
  END IF;
  IF p_caixa_codigo IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM b2c_embalagem_caixa WHERE codigo = p_caixa_codigo AND ativo) THEN
      RAISE EXCEPTION 'Caixa "%" inexistente ou inativa (dimensão b2c_embalagem_caixa).', p_caixa_codigo; END IF;
  ELSE
    v_dim := public.fn_mesa_sp_caixa_dim_valida(p_caixa_dim);
    IF v_dim IS NULL THEN RAISE EXCEPTION 'Correios exige a caixa usada (do cadastro ou medidas da caixa avulsa)'; END IF;
  END IF;
  m := v_ult.metadata;
  INSERT INTO pedido_eventos (pedido_id, tipo_evento, descricao, metadata, automatico, ator_tipo, ator_origem)
  VALUES (p_pedido_id, 'mesa_embalado',
    format('Mesa SP: embalagem corrigida — caixa %s (mesmo peso %s kg, %s vol).',
      coalesce(p_caixa_codigo, format('avulsa %sx%sx%s cm', v_dim->>'comprimento_cm', v_dim->>'largura_cm', v_dim->>'altura_cm')), m->>'peso_kg', m->>'volumes'),
    (m - 'caixa' - 'caixa_dim' - 'auth_uid')
      || jsonb_build_object('caixa', p_caixa_codigo, 'caixa_dim', v_dim, 'auth_uid', auth.uid(), 'correcao_de', v_ult.id)
      || public.fn_mesa_sp_caixa_aprende(p_pedido_id, p_caixa_codigo, coalesce((m->>'volumes')::int, 1)),
    false, 'humano', 'mesa_sp');
  RETURN jsonb_build_object('ok', true, 'caixa', p_caixa_codigo, 'caixa_dim', v_dim);
END $f$;
REVOKE ALL ON FUNCTION public.fn_mesa_sp_corrigir_caixa(uuid,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_mesa_sp_corrigir_caixa(uuid,text,jsonb) TO authenticated, service_role;