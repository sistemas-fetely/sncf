-- B-54: fn_compra_finalizada_propagar usava NEW.conta_id após Onda E.
-- A Onda E (24/05 noite) renomeou compras_registradas.conta_id → plano_contas_id.
-- Trigger foi recriado durante o B-44 (DROP do ENUM 'ativa') com o body pré-Fase 3,
-- perdendo o fix anterior. Próxima compra finalizada quebraria com:
--   "column conta_id of relation new does not exist"
-- Aplicado em produção via SQL Editor em 26/05. Esta migration versiona o fix.

CREATE OR REPLACE FUNCTION public.fn_compra_finalizada_propagar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pedido RECORD;
  v_linha RECORD;
  v_valor_parcela numeric;
  v_valor_ultima numeric;
  v_data_venc date;
  v_cprs_geradas integer := 0;
  v_descricao_pedido text;
  v_soma_estimada numeric := 0;
  v_pct_divergencia numeric;
  v_valor_diferenca numeric;
  v_aviso_divergencia text := NULL;
  v_itens_cobertos integer := 0;
  v_pula_aprovacao boolean := false;
  v_status_cpr text;
  v_enviado_em timestamptz;
  v_enviado_por uuid;
BEGIN
  IF NOT (OLD.status = 'rascunho' AND NEW.status = 'finalizada') THEN
    RETURN NEW;
  END IF;

  IF NEW.valor_total <= 0 THEN
    RAISE EXCEPTION 'Compra nao pode ser finalizada com valor total zero ou negativo (atual: R$ %). Revise as linhas ou ajuste o desconto.', NEW.valor_total;
  END IF;

  SELECT * INTO v_pedido FROM public.pedidos_compra WHERE id = NEW.pedido_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % nao encontrado pra compra %', NEW.pedido_id, NEW.id;
  END IF;

  v_descricao_pedido := v_pedido.descricao_geral;

  SELECT pula_aprovacao INTO v_pula_aprovacao
    FROM public.formas_pagamento
    WHERE id = NEW.meio_pagamento_id;

  IF v_pula_aprovacao THEN
    v_status_cpr := 'enviado_para_pagamento';
    v_enviado_em := now();
    v_enviado_por := NEW.comprador_id;
  ELSE
    v_status_cpr := 'aberto';
    v_enviado_em := NULL;
    v_enviado_por := NULL;
  END IF;

  FOR v_linha IN
    SELECT * FROM public.compras_registradas_itens
    WHERE compra_registrada_id = NEW.id
  LOOP
    IF v_linha.status_linha = 'comprada' AND v_linha.pedido_item_id IS NOT NULL THEN
      UPDATE public.pedidos_compra_itens SET status = 'comprado' WHERE id = v_linha.pedido_item_id;
      v_itens_cobertos := v_itens_cobertos + 1;
    END IF;
    IF v_linha.status_linha = 'substituida' AND v_linha.pedido_item_id IS NOT NULL THEN
      UPDATE public.pedidos_compra_itens SET status = 'comprado' WHERE id = v_linha.pedido_item_id;
      v_itens_cobertos := v_itens_cobertos + 1;
    END IF;
    IF v_linha.status_linha = 'nao_comprada' AND v_linha.pedido_item_id IS NOT NULL THEN
      UPDATE public.pedidos_compra_itens
        SET status = 'cancelado',
            cancelamento_motivo = COALESCE(cancelamento_motivo, 'Nao veio na compra')
        WHERE id = v_linha.pedido_item_id;
    END IF;
    IF v_linha.substitui_pedido_item_id IS NOT NULL AND v_linha.status_linha = 'comprada' THEN
      v_itens_cobertos := v_itens_cobertos + 1;
    END IF;
  END LOOP;

  SELECT COALESCE(SUM(quantidade * valor_estimado_unitario), 0)
    INTO v_soma_estimada
    FROM public.pedidos_compra_itens
    WHERE pedido_id = NEW.pedido_id
      AND status IN ('comprado','cancelado');

  IF v_soma_estimada > 0 THEN
    v_valor_diferenca := ABS(NEW.valor_total - v_soma_estimada);
    v_pct_divergencia := (v_valor_diferenca / v_soma_estimada) * 100;
    IF v_pct_divergencia > 30 AND v_valor_diferenca > 200 THEN
      v_aviso_divergencia := format(
        'Divergencia de %s%% (R$ %s) entre estimado (R$ %s) e real (R$ %s)',
        ROUND(v_pct_divergencia, 1), v_valor_diferenca, v_soma_estimada, NEW.valor_total
      );
    END IF;
  END IF;

  v_valor_parcela := ROUND(NEW.valor_total / NEW.parcelas_count, 2);
  v_valor_ultima := NEW.valor_total - (v_valor_parcela * (NEW.parcelas_count - 1));

  FOR i IN 1..NEW.parcelas_count LOOP
    IF NEW.periodicidade = 'meses' THEN
      v_data_venc := (NEW.primeira_parcela_data + ((i - 1) || ' months')::INTERVAL)::date;
    ELSE
      v_data_venc := NEW.primeira_parcela_data + ((i - 1) * NEW.intervalo_dias);
    END IF;

    INSERT INTO public.contas_pagar_receber (
      tipo, status, descricao, valor, data_compra, data_vencimento,
      plano_contas_id, parceiro_id, centro_custo_id, linha_investimento_id,
      forma_pagamento_id, unidade_id, parcela_grupo_id,
      numero_parcela, total_parcelas, parcelas,
      observacao, aprovado_em, aprovado_por,
      enviado_pagamento_em, enviado_pagamento_por, criado_por,
      pedido_compra_id, compra_registrada_id, origem, nf_aplicavel
    ) VALUES (
      'pagar',
      v_status_cpr,
      v_descricao_pedido || CASE WHEN NEW.parcelas_count > 1 THEN format(' - parcela %s/%s', i, NEW.parcelas_count) ELSE '' END,
      CASE WHEN i = NEW.parcelas_count THEN v_valor_ultima ELSE v_valor_parcela END,
      NEW.data_compra,
      v_data_venc,
      NEW.plano_contas_id,         -- B-54 FIX: era NEW.conta_id (renomeada na Onda E)
      NEW.parceiro_id,
      v_pedido.centro_custo_id,
      v_pedido.linha_investimento_id,
      NEW.meio_pagamento_id,
      v_pedido.unidade_id,
      NEW.parcela_grupo_id,
      i,
      NEW.parcelas_count,
      NEW.parcelas_count,
      NEW.observacao,
      now(),
      NEW.comprador_id,
      v_enviado_em,
      v_enviado_por,
      NEW.comprador_id,
      NEW.pedido_id,
      NEW.id,
      'pedido_compra',
      false
    );

    v_cprs_geradas := v_cprs_geradas + 1;
  END LOOP;

  INSERT INTO public.compras_registradas_audit_log (
    compra_registrada_id, acao, payload, usuario_id
  ) VALUES (
    NEW.id,
    'COMPRA_FINALIZADA',
    jsonb_build_object(
      'pedido_id', NEW.pedido_id,
      'itens_cobertos', v_itens_cobertos,
      'valor_total', NEW.valor_total,
      'parcelas', NEW.parcelas_count,
      'periodicidade', NEW.periodicidade,
      'cprs_geradas', v_cprs_geradas,
      'status_cpr_inicial', v_status_cpr,
      'pula_aprovacao', v_pula_aprovacao,
      'aviso_divergencia', v_aviso_divergencia
    ),
    NEW.comprador_id
  );

  PERFORM public.fn_log_evento_pedido(
    NEW.pedido_id,
    'compra_registrada',
    jsonb_build_object(
      'compra_id', NEW.id,
      'valor_total', NEW.valor_total,
      'parcelas', NEW.parcelas_count,
      'itens_cobertos', v_itens_cobertos,
      'aviso_divergencia', v_aviso_divergencia
    ),
    NEW.comprador_id
  );

  RETURN NEW;
END;
$function$;
