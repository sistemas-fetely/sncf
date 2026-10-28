-- MESA-SP-CAIXA-APRENDE (28/10/2026): sugestão do sistema x escolha do operador, para recalibrar a regra de caixa.
-- Nunca lança erro: cada parte que falhar vira null (não pode bloquear a embalagem).
CREATE OR REPLACE FUNCTION public.fn_mesa_sp_caixa_aprende(p_pedido_id uuid, p_caixa_codigo text, p_volumes integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sug_cod text; v_sug_vol integer; v_calc jsonb; v_peso numeric;
BEGIN
  BEGIN
    SELECT s.codigo, s.volumes INTO v_sug_cod, v_sug_vol
      FROM public.fn_mesa_sp_caixas_sugeridas(p_pedido_id) s WHERE s.sugerida LIMIT 1;
    IF p_caixa_codigo IS NOT NULL THEN
      SELECT jsonb_build_object('volumes', s.volumes, 'ocupacao_pct', s.ocupacao_pct, 'cabe', s.cabe) INTO v_calc
        FROM public.fn_mesa_sp_caixas_sugeridas(p_pedido_id) s WHERE s.codigo = p_caixa_codigo LIMIT 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'MESA-SP-CAIXA-APRENDE: sugestão falhou para %: %', p_pedido_id, SQLERRM;
    v_sug_cod := NULL; v_sug_vol := NULL; v_calc := NULL;
  END;
  BEGIN
    v_peso := (public.fn_mesa_sp_peso_estimado(p_pedido_id, p_caixa_codigo, p_volumes)->>'total_kg')::numeric;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'MESA-SP-CAIXA-APRENDE: peso estimado falhou para %: %', p_pedido_id, SQLERRM;
    v_peso := NULL;
  END;
  RETURN jsonb_build_object('caixa_sugerida', v_sug_cod, 'volumes_sugeridos', v_sug_vol,
                            'calc_escolhida', v_calc, 'peso_estimado_kg', v_peso,
                            'regra_caixa_versao', 'CAIXAS-V2');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('caixa_sugerida', null, 'volumes_sugeridos', null, 'calc_escolhida', null,
                            'peso_estimado_kg', null, 'regra_caixa_versao', 'CAIXAS-V2');
END $function$;
REVOKE ALL ON FUNCTION public.fn_mesa_sp_caixa_aprende(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_mesa_sp_caixa_aprende(uuid, text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_mesa_sp_embalar(p_pedido_id uuid, p_peso_kg numeric, p_volumes integer, p_modal text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- MESA-SP-CAIXA-APRENDE (28/10/2026): o evento mesa_embalado guarda a sugestão do sistema ao lado da escolha do operador (fn_mesa_sp_caixa_aprende), para recalibrar a regra de caixa. Falha no cálculo nunca bloqueia a embalagem.
DECLARE v_estagio text;
BEGIN
  -- BANCADA-SP-TRAVA (19/10/2026): acao da propria Mesa pode mudar pedido na bancada.
  PERFORM set_config('sncf.mesa_sp', 'on', true);
  -- MESA-SP-CANCELAMENTO (18/10/2026): pedido com cancelamento solicitado não avança.
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
  INSERT INTO pedido_eventos (pedido_id, tipo_evento, descricao, metadata, automatico, ator_tipo, ator_origem)
  VALUES (p_pedido_id, 'mesa_embalado',
          format('Mesa SP: embalado — %s vol, %s kg, modal %s.', p_volumes, p_peso_kg, p_modal),
          jsonb_build_object('peso_kg',p_peso_kg,'volumes',p_volumes,'modal',p_modal,'auth_uid',auth.uid()) || public.fn_mesa_sp_caixa_aprende(p_pedido_id, NULL, p_volumes), false, 'humano', 'mesa_sp');
  RETURN jsonb_build_object('ok', true);
END $function$;

CREATE OR REPLACE FUNCTION public.fn_mesa_sp_embalar(p_pedido_id uuid, p_peso_kg numeric, p_volumes integer, p_modal text, p_checklist jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- MESA-SP-CAIXA-APRENDE (28/10/2026): o evento mesa_embalado guarda a sugestão do sistema ao lado da escolha do operador (fn_mesa_sp_caixa_aprende), para recalibrar a regra de caixa. Falha no cálculo nunca bloqueia a embalagem.
DECLARE
  v_estagio text;
  v_faltando text;
BEGIN
  -- BANCADA-SP-TRAVA (19/10/2026): acao da propria Mesa pode mudar pedido na bancada.
  PERFORM set_config('sncf.mesa_sp', 'on', true);
  -- MESA-SP-CANCELAMENTO (18/10/2026): pedido com cancelamento solicitado não avança.
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

  -- 19/09/2026 · CHECKLIST-E-NO-BANCO-TAMBEM: a rotina de bancada (etiqueta,
  -- DANFE, romaneio) vive em b2c_embalagem_checklist. A tela desabilita o botão,
  -- mas quem GARANTE é aqui — tela é conveniência, banco é a trava.
  -- p_checklist = array de rótulos marcados, ex.: ["Imprimir a DANFE", ...].
  SELECT string_agg(c.rotulo, ' · ' ORDER BY c.ordem) INTO v_faltando
    FROM b2c_embalagem_checklist c
   WHERE c.modal_codigo = p_modal AND c.ativo AND c.obrigatorio
     AND NOT (coalesce(p_checklist, '[]'::jsonb) ? c.rotulo);

  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'Rotina de embalagem incompleta para %: %', p_modal, v_faltando;
  END IF;

  INSERT INTO pedido_eventos (pedido_id, tipo_evento, descricao, metadata, automatico, ator_tipo, ator_origem)
  VALUES (p_pedido_id, 'mesa_embalado',
          format('Mesa SP: embalado — %s vol, %s kg, modal %s.', p_volumes, p_peso_kg, p_modal),
          jsonb_build_object('peso_kg',p_peso_kg,'volumes',p_volumes,'modal',p_modal,
                             'checklist', coalesce(p_checklist,'[]'::jsonb), 'auth_uid',auth.uid()) || public.fn_mesa_sp_caixa_aprende(p_pedido_id, NULL, p_volumes),
          false, 'humano', 'mesa_sp');
  RETURN jsonb_build_object('ok', true);
END $function$;

CREATE OR REPLACE FUNCTION public.fn_mesa_sp_embalar(p_pedido_id uuid, p_peso_kg numeric, p_volumes integer, p_modal text, p_checklist jsonb DEFAULT NULL::jsonb, p_caixa_codigo text DEFAULT NULL::text)
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
BEGIN
  -- BANCADA-SP-TRAVA (19/10/2026): acao da propria Mesa pode mudar pedido na bancada.
  PERFORM set_config('sncf.mesa_sp', 'on', true);
  -- MESA-SP-CANCELAMENTO (18/10/2026): pedido com cancelamento solicitado não avança.
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

  -- MESA-SP-MODAIS-NEGOCIO (26/10/2026): o modal nasce do pedido; diferente disso só com troca registrada (motivo).
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
                 CASE WHEN p_caixa_codigo IS NOT NULL THEN ', caixa '||p_caixa_codigo ELSE '' END),
          jsonb_build_object('peso_kg',p_peso_kg,'volumes',p_volumes,'modal',p_modal,'modal_sugerido',v_sug,
                             'caixa', p_caixa_codigo, 'rotina', v_marcados, 'auth_uid',auth.uid()) || public.fn_mesa_sp_caixa_aprende(p_pedido_id, p_caixa_codigo, p_volumes),
          false, 'humano', 'mesa_sp');

  DELETE FROM b2c_embalagem_marcacao WHERE pedido_id = p_pedido_id;

  -- MESA-SP-MODO-B2B (04/10/2026): no B2B a separacao vem ANTES da NF.
  IF EXISTS (SELECT 1 FROM pedidos WHERE id = p_pedido_id AND canal = 'B2B') THEN
    PERFORM public.transicionar_pedido(p_pedido_id, 'pre_faturamento', NULL,
      format('Mesa SP: embalado (%s vol, %s kg) — pronto para faturar (NF da matriz SP)', p_volumes, p_peso_kg), false);
    RETURN jsonb_build_object('ok', true, 'caixa', p_caixa_codigo, 'estagio', 'pre_faturamento');
  END IF;
  RETURN jsonb_build_object('ok', true, 'caixa', p_caixa_codigo);
END $function$;