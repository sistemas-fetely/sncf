CREATE OR REPLACE FUNCTION public.propor_cobranca(p_pedido_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
-- 30/08/2026 — ANCORA-E-HOJE, PRAZO-E-DA-CONDICAO: vencimento = hoje + prazo da condicao aprovada;
-- prorrogacao so como semente quando a condicao nao traz prazo.
-- 28/10/2026 — VALOR-VEM-DO-PEDIDO: os valores gravados na condicao aprovada sao uma copia
-- congelada; o valor das parcelas vem SEMPRE de pedidos.valor_liquido atual.
DECLARE
  v_pedido          record;
  v_analise         record;
  v_condicao        jsonb;
  v_entrada         jsonb;
  v_parcelas        jsonb;
  v_total_parcelas  int;
  v_proposta        jsonb := '[]'::jsonb;
  v_ordem           int := 0;
  v_parcela         jsonb;
  v_dias            int;
  v_prorrogacao     int := 0;
  v_tem_prazo       boolean := false;
  v_ancora          date;
  v_total_geral     int;
  v_haver_aplicado  numeric := 0;
  v_valor_a_cobrar  numeric;
  v_total_base      numeric := 0;
  v_n               int;
  v_idx             int := 0;
  v_acc             numeric := 0;
  v_val             numeric;
  v_nova            jsonb := '[]'::jsonb;
  v_adiant_vivo     numeric := 0;
  v_valor_aprovado  numeric := 0;
  v_recalculado     boolean := false;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT usuario_tem_acao('acao.cobranca_plano') THEN
    RAISE EXCEPTION 'Sem permissao (acao.cobranca_plano).  Concessao e feita no Console de Acesso.';
  END IF;
  SELECT id, parceiro_id, id_externo, data_pedido, valor_liquido, estagio
  INTO v_pedido FROM pedidos WHERE id = p_pedido_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % nao encontrado', p_pedido_id USING ERRCODE = '02000';
  END IF;

  SELECT id, condicao_final_aprovada INTO v_analise
  FROM analises_credito
  WHERE pedido_id = p_pedido_id AND status_final IN ('aprovado', 'aprovado_com_ressalva')
  ORDER BY decidido_em DESC NULLS LAST LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % nao tem analise aprovada - nao pode propor cobranca',
      p_pedido_id USING ERRCODE = '22023';
  END IF;

  v_condicao       := v_analise.condicao_final_aprovada;
  v_entrada        := v_condicao -> 'entrada';
  v_parcelas       := COALESCE(v_condicao -> 'parcelas_a_prazo', '[]'::jsonb);
  v_total_parcelas := jsonb_array_length(v_parcelas);

  IF (v_entrada IS NOT NULL AND v_entrada <> 'null'::jsonb AND v_entrada ? 'dias'
      AND v_entrada ->> 'dias' IS NOT NULL) THEN
    v_tem_prazo := true;
  END IF;
  IF NOT v_tem_prazo AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_parcelas) e
     WHERE e ? 'dias' AND e ->> 'dias' IS NOT NULL
  ) THEN
    v_tem_prazo := true;
  END IF;

  IF NOT v_tem_prazo THEN
    SELECT COALESCE(NULLIF(valor, '')::int, 0) INTO v_prorrogacao
    FROM parametros
    WHERE categoria = 'dias_primeiro_pagamento' AND ativo
    ORDER BY ordem NULLS LAST LIMIT 1;
    v_prorrogacao := GREATEST(COALESCE(v_prorrogacao, 0), 0);
  END IF;

  v_ancora := current_date + v_prorrogacao;

  v_total_geral := v_total_parcelas + CASE
    WHEN v_entrada IS NOT NULL AND v_entrada <> 'null'::jsonb THEN 1 ELSE 0 END;
  IF v_total_geral = 0 THEN v_total_geral := 1; END IF;

  IF v_entrada IS NOT NULL AND v_entrada <> 'null'::jsonb THEN
    v_ordem := v_ordem + 1;
    v_dias  := COALESCE((v_entrada ->> 'dias')::int, 0);
    v_proposta := v_proposta || jsonb_build_object(
      'ordem', v_ordem, 'numero_parcela', v_ordem, 'total_parcelas', v_total_geral,
      'eh_entrada', false,
      'tipo_pagamento', COALESCE(v_entrada ->> 'tipo', 'pix'),
      'valor_bruto', (v_entrada -> 'valor')::numeric,
      'prazo_dias', v_dias,
      'data_vencimento', (v_ancora + v_dias)::text,
      'condicao_pagamento', v_dias || ' dias');
  END IF;

  FOR v_parcela IN SELECT jsonb_array_elements(v_parcelas) LOOP
    v_ordem := v_ordem + 1;
    v_dias  := COALESCE((v_parcela ->> 'dias')::int, 0);
    v_proposta := v_proposta || jsonb_build_object(
      'ordem', v_ordem, 'numero_parcela', v_ordem, 'total_parcelas', v_total_geral,
      'eh_entrada', false,
      'tipo_pagamento', COALESCE(v_parcela ->> 'tipo', 'boleto'),
      'valor_bruto', (v_parcela -> 'valor')::numeric,
      'prazo_dias', v_dias,
      'data_vencimento', (v_ancora + v_dias)::text,
      'condicao_pagamento', v_dias || ' dias');
  END LOOP;

  SELECT COALESCE(SUM(valor_aplicado), 0) INTO v_haver_aplicado
  FROM haver_aplicacao WHERE pedido_id = p_pedido_id;

  v_valor_a_cobrar := v_pedido.valor_liquido - v_haver_aplicado;

  SELECT COALESCE(SUM((e ->> 'valor_bruto')::numeric), 0) INTO v_total_base
  FROM jsonb_array_elements(v_proposta) e;

  v_valor_aprovado := v_total_base;

  -- VALOR-VEM-DO-PEDIDO: pedido mudou depois da aprovacao (ex.: frete incluido) ->
  -- mantem numero de parcelas, prazos e tipo; valor dividido igual, resto na ultima.
  -- Com haver, segue a regra proporcional abaixo.
  IF v_haver_aplicado = 0 AND v_valor_a_cobrar > 0
     AND jsonb_array_length(v_proposta) > 0
     AND abs(v_total_base - v_valor_a_cobrar) > 0.005 THEN
    v_n := jsonb_array_length(v_proposta);
    v_val := floor(v_valor_a_cobrar * 100 / v_n) / 100;
    FOR v_parcela IN SELECT jsonb_array_elements(v_proposta) LOOP
      v_idx := v_idx + 1;
      v_nova := v_nova || (v_parcela || jsonb_build_object('valor_bruto',
        CASE WHEN v_idx < v_n THEN v_val ELSE round(v_valor_a_cobrar - v_val * (v_n - 1), 2) END));
    END LOOP;
    v_proposta := v_nova;
    v_recalculado := true;
  ELSIF v_haver_aplicado > 0 AND v_total_base > 0 AND v_valor_a_cobrar > 0 THEN
    v_n := jsonb_array_length(v_proposta);
    FOR v_parcela IN SELECT jsonb_array_elements(v_proposta) LOOP
      v_idx := v_idx + 1;
      IF v_idx < v_n THEN
        v_val := round((v_parcela ->> 'valor_bruto')::numeric * v_valor_a_cobrar / v_total_base, 2);
        v_acc := v_acc + v_val;
      ELSE
        v_val := round(v_valor_a_cobrar - v_acc, 2);
      END IF;
      v_nova := v_nova || (v_parcela || jsonb_build_object('valor_bruto', v_val));
    END LOOP;
    v_proposta := v_nova;
  ELSIF v_valor_a_cobrar <= 0 THEN
    v_proposta := '[]'::jsonb;
  END IF;

  SELECT COALESCE(SUM(saldo), 0) INTO v_adiant_vivo
  FROM haver_cliente
  WHERE origem_pedido_id = p_pedido_id AND origem = 'adiantamento'
    AND status IN ('disponivel','parcial');

  RETURN jsonb_build_object(
    'pedido_id', v_pedido.id,
    'parceiro_id', v_pedido.parceiro_id,
    'pedido_id_externo', v_pedido.id_externo,
    'analise_credito_id', v_analise.id,
    'valor_total', v_pedido.valor_liquido,
    'valor_a_cobrar', GREATEST(v_valor_a_cobrar, 0),
    'valor_aprovado_plano', v_valor_aprovado,
    'plano_recalculado', v_recalculado,
    'haver_aplicado', v_haver_aplicado,
    'tem_haver', (v_haver_aplicado > 0),
    'adiantamento_vivo', v_adiant_vivo,
    'ancora', v_ancora::text,
    'prorrogacao_dias', v_prorrogacao,
    'condicao_tem_prazo', v_tem_prazo,
    'aviso', CASE WHEN v_adiant_vivo > 0
              THEN format('Cliente tem R$ %s de adiantamento vivo neste pedido — sera abatido automaticamente no faturamento; nao cobrar esse valor de novo.', v_adiant_vivo)
              ELSE NULL END,
    'tem_entrada', false,
    'condicao_original', v_condicao ->> 'condicao_original',
    'titulos_propostos', v_proposta
  );
END;
$function$;