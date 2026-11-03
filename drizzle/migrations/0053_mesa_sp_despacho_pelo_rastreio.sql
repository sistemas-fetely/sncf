-- MESA-SP-DESPACHO-PELO-RASTREIO (03/11/2026, Flávio): o primeiro evento de movimento dos Correios
-- (qualquer evento que não seja "Etiqueta emitida"/FC) despacha o pedido da Mesa SP aguardando coleta,
-- gravando o mesmo mesa_despachado do despacho manual (ator sistema, origem correios_rastreio). Idempotente.

CREATE OR REPLACE FUNCTION public.fn_correios_primeiro_movimento(p_eventos jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT x || jsonb_build_object('em', ((x->>'dtHrCriado')::timestamp AT TIME ZONE 'America/Sao_Paulo'))
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_eventos) = 'array' THEN p_eventos ELSE '[]'::jsonb END) x
   WHERE coalesce(x->>'codigo','') <> 'FC' AND nullif(x->>'dtHrCriado','') IS NOT NULL
   ORDER BY (x->>'dtHrCriado')::timestamp ASC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.fn_mesa_sp_despachar_por_rastreio(p_codigo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; v_ped record; v_mov jsonb; v_emb timestamptz; v_modal text; v_em timestamptz; v_desc text; v_nome text;
BEGIN
  SELECT * INTO r FROM pedido_rastreamento WHERE codigo_rastreio = p_codigo;
  IF r.pedido_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'sem_pedido'); END IF;
  v_mov := public.fn_correios_primeiro_movimento(r.eventos);
  IF v_mov IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'sem_movimento'); END IF;

  SELECT max(criado_em) INTO v_emb FROM pedido_eventos WHERE pedido_id = r.pedido_id AND tipo_evento = 'mesa_embalado';
  IF v_emb IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'fora_da_mesa'); END IF;
  -- Postagem na agência segue a regra MESA-SP-AGENCIA-BIPE-VENCE (bipe obrigatório).
  IF EXISTS (SELECT 1 FROM pedido_eventos WHERE pedido_id = r.pedido_id AND tipo_evento = 'mesa_postagem_agencia') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'postagem_agencia'); END IF;
  IF EXISTS (SELECT 1 FROM pedido_eventos WHERE pedido_id = r.pedido_id AND tipo_evento = 'mesa_despachado'
              AND (criado_em > v_emb OR metadata->>'referencia' = p_codigo)) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ja_despachado'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pedido_eventos WHERE pedido_id = r.pedido_id AND tipo_evento = 'mesa_documentos_ok' AND criado_em > v_emb) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'documentos_pendentes'); END IF;

  v_modal := public.fn_mesa_sp_modal_do_pedido(r.pedido_id);
  SELECT nome INTO v_nome FROM b2c_modal_entrega WHERE codigo = v_modal AND exige_etiqueta_correios;
  IF v_nome IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'modal_nao_correios'); END IF;

  SELECT id, estagio, canal INTO v_ped FROM pedidos WHERE id = r.pedido_id FOR UPDATE;
  IF v_ped.estagio IN ('cancelado','entregue') THEN RETURN jsonb_build_object('ok', false, 'motivo', 'estagio_' || v_ped.estagio); END IF;
  v_em := (v_mov->>'em')::timestamptz;
  v_desc := format('Mesa SP: despachado via %s — ref %s (Correios: %s)', v_nome, p_codigo, v_mov->>'descricao');

  IF v_ped.canal = 'B2B' AND v_ped.estagio = 'faturado' THEN
    PERFORM public.transicionar_pedido(r.pedido_id, 'em_transporte', NULL, v_desc, true);
  ELSIF v_ped.estagio = 'em_separacao' THEN
    UPDATE pedidos SET estagio = 'em_transporte' WHERE id = r.pedido_id;
  END IF;

  INSERT INTO pedido_eventos (pedido_id, tipo_evento, estagio_anterior, estagio_novo, descricao, metadata, automatico, ator_tipo, ator_origem, criado_em)
  VALUES (r.pedido_id, 'mesa_despachado', v_ped.estagio, 'em_transporte', v_desc || '.',
          jsonb_build_object('modal', v_modal, 'referencia', p_codigo, 'codigo', p_codigo, 'executor', NULL,
                             'evento_correios', v_mov - 'em', 'evento_correios_em', v_em, 'origem', 'correios_rastreio'),
          true, 'sistema', 'correios_rastreio', v_em);
  RETURN jsonb_build_object('ok', true, 'pedido_id', r.pedido_id, 'codigo', p_codigo, 'despachado_em', v_em);
END $$;
REVOKE ALL ON FUNCTION public.fn_mesa_sp_despachar_por_rastreio(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_mesa_sp_despachar_por_rastreio(text) TO service_role;

-- Gatilho: roda antes (ordem alfabética) do trg_rastreio_pedido_em_transito; nunca derruba a gravação do rastreio.
CREATE OR REPLACE FUNCTION public.fn_trg_rastreio_mesa_despachado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.pedido_id IS NULL OR public.fn_correios_primeiro_movimento(NEW.eventos) IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND public.fn_correios_primeiro_movimento(OLD.eventos) IS NOT NULL
     AND OLD.pedido_id IS NOT DISTINCT FROM NEW.pedido_id THEN RETURN NEW; END IF;
  BEGIN
    PERFORM public.fn_mesa_sp_despachar_por_rastreio(NEW.codigo_rastreio);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO pedido_eventos (pedido_id, tipo_evento, descricao, metadata, automatico)
    VALUES (NEW.pedido_id, 'erro_automacao', 'Despacho automático pelo rastreio falhou: ' || SQLERRM,
            jsonb_build_object('erro_origem','fn_trg_rastreio_mesa_despachado','codigo_rastreio',NEW.codigo_rastreio), true);
  END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_rastreio_mesa_despachado ON public.pedido_rastreamento;
CREATE TRIGGER trg_rastreio_mesa_despachado AFTER INSERT OR UPDATE OF eventos, pedido_id ON public.pedido_rastreamento
  FOR EACH ROW EXECUTE FUNCTION public.fn_trg_rastreio_mesa_despachado();

-- Códigos que a busca de 30 min consulta: etiqueta SNCF viva, pedido da Mesa aguardando coleta, sem movimento.
CREATE OR REPLACE FUNCTION public.fn_mesa_sp_codigos_aguardando_coleta()
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(array_agg(DISTINCT r.codigo_rastreio), '{}')
    FROM pedido_rastreamento r
    JOIN correios_prepostagem pp ON pp.pedido_id = r.pedido_id AND pp.codigo_objeto = r.codigo_rastreio AND pp.status <> 'cancelada'
    JOIN pedidos p ON p.id = r.pedido_id
   WHERE p.estagio IN ('em_separacao','faturado')
     AND public.fn_correios_primeiro_movimento(r.eventos) IS NULL
     AND EXISTS (SELECT 1 FROM pedido_eventos e WHERE e.pedido_id = r.pedido_id AND e.tipo_evento = 'mesa_documentos_ok'
                  AND e.criado_em > (SELECT max(criado_em) FROM pedido_eventos WHERE pedido_id = r.pedido_id AND tipo_evento = 'mesa_embalado'))
$$;
REVOKE ALL ON FUNCTION public.fn_mesa_sp_codigos_aguardando_coleta() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_cron_mesa_sp_rastreio_coleta()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v text[] := public.fn_mesa_sp_codigos_aguardando_coleta();
BEGIN
  IF coalesce(array_length(v, 1), 0) = 0 THEN RETURN NULL; END IF; -- nada aguardando: não chama os Correios
  RETURN public.fn_cron_chamar_edge('mesa-sp-rastreio-coleta-30min', 'correios-rastreio-sync',
                                     jsonb_build_object('codigos', to_jsonb(v)), 120000);
END $$;
REVOKE ALL ON FUNCTION public.fn_cron_mesa_sp_rastreio_coleta() FROM PUBLIC, anon, authenticated;