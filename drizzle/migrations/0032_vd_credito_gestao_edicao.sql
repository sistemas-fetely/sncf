CREATE OR REPLACE FUNCTION public.fn_vd_credito_aplicado(p_pedido_id uuid)
 RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$ SELECT coalesce((SELECT sum(valor_aplicado) FROM public.haver_aplicacao WHERE pedido_id = p_pedido_id), 0)::numeric $f$;
REVOKE ALL ON FUNCTION public.fn_vd_credito_aplicado(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vd_credito_aplicado(uuid) TO authenticated, service_role;

-- CREDITO-NA-EDICAO (29/10/2026): edicao/remontagem preservam o credito aplicado; portao = liquido - credito.
DO $do$
DECLARE d text; n text;
BEGIN
  SELECT pg_get_functiondef('public.vd_editar_pedido(uuid,jsonb,jsonb,text,text,text)'::regprocedure) INTO d;
  n := replace(d, 'v_so_cartao boolean := false;', 'v_so_cartao boolean := false; v_credito numeric := public.fn_vd_credito_aplicado(p_pedido_id);');
  n := replace(n, $s$    DELETE FROM provisao_recebimento WHERE pedido_id = v.id AND status = 'prevista' AND pago_em IS NULL;$s$,
$s$    -- CREDITO-NA-EDICAO (29/10/2026): so o portao morre; a provisao 'haver' (credito aplicado) fica.
    IF round(v_total, 2) < round(v_credito, 2) THEN
      RAISE EXCEPTION 'O novo total (R$ %) ficou menor que o crédito já aplicado (R$ %). Cancele o pedido e refaça.',
        to_char(round(v_total,2), 'FM999G999G990D00'), to_char(round(v_credito,2), 'FM999G999G990D00') USING ERRCODE = '22023';
    END IF;
    DELETE FROM provisao_recebimento WHERE pedido_id = v.id AND eh_portao AND status = 'prevista' AND pago_em IS NULL;$s$);
  n := replace(n, $s$'avisos', v_calc->'avisos',$s$, $s$'avisos', v_calc->'avisos', 'credito_aplicado', v_credito, 'valor_a_pagar', round(v_total - v_credito, 2),$s$);
  IF position('v_credito numeric' in n) = 0 OR position('AND eh_portao AND status' in n) = 0 OR position('valor_a_pagar' in n) = 0 THEN
    RAISE EXCEPTION 'vd_editar_pedido: trecho esperado nao encontrado'; END IF;
  EXECUTE n;

  SELECT pg_get_functiondef('public.vd_remontar_pagamento(uuid)'::regprocedure) INTO d;
  n := replace(d, 'v_forma text;', 'v_forma text; v_credito numeric; v_a_pagar numeric;');
  n := replace(n, '  SELECT id, valor INTO v_ativo', $s$  v_credito := public.fn_vd_credito_aplicado(v.id);
  v_a_pagar := round(v.valor_liquido - v_credito, 2);
  IF v_a_pagar <= 0 THEN RAISE EXCEPTION 'Pedido coberto pelo crédito — nada a cobrar.' USING ERRCODE = '22023'; END IF;
  SELECT id, valor INTO v_ativo$s$);
  n := replace(n, 'round(v_ativo.valor, 2) = round(v.valor_liquido, 2)', 'round(v_ativo.valor, 2) = v_a_pagar');
  n := replace(n, $s$'valor', v.valor_liquido, 'valor_bruto', v.valor_liquido,$s$, $s$'valor', v_a_pagar, 'valor_bruto', v_a_pagar,$s$);
  n := replace(n, $s$portão de R$ ' || v.valor_liquido ||$s$, $s$portão de R$ ' || v_a_pagar ||$s$);
  n := replace(n, $s$jsonb_build_object('provisao_id', v_prov, 'valor', v.valor_liquido,$s$, $s$jsonb_build_object('provisao_id', v_prov, 'valor', v_a_pagar, 'credito_aplicado', v_credito,$s$);
  n := replace(n, $s$'valor', v.valor_liquido, 'forma', v_forma, 'provisao_id'$s$, $s$'valor', v_a_pagar, 'credito_aplicado', v_credito, 'valor_a_pagar', v_a_pagar, 'forma', v_forma, 'provisao_id'$s$);
  IF position('v_a_pagar <= 0' in n) = 0 OR position('= v_a_pagar' in n) = 0 OR position($s$'valor_a_pagar', v_a_pagar$s$ in n) = 0
     OR position($s$'valor', v_a_pagar, 'valor_bruto'$s$ in n) = 0 OR position($s$portão de R$ ' || v_a_pagar$s$ in n) = 0
     OR position($s$'valor', v_a_pagar, 'credito_aplicado', v_credito,$s$ in n) = 0 THEN
    RAISE EXCEPTION 'vd_remontar_pagamento: trecho esperado nao encontrado'; END IF;
  EXECUTE n;

  d := pg_get_viewdef('public.vw_venda_direta_gestao'::regclass, true);
  n := replace(d, E'fn_vendedor_nome(pv.vendedor_id) AS vendedor_nome\n',
    E'fn_vendedor_nome(pv.vendedor_id) AS vendedor_nome,\n    fn_vd_credito_aplicado(k.id) AS credito_aplicado,\n    round(k.valor_liquido - fn_vd_credito_aplicado(k.id), 2) AS valor_a_pagar\n');
  IF n = d THEN RAISE EXCEPTION 'vw_venda_direta_gestao: trecho esperado nao encontrado'; END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_venda_direta_gestao WITH (security_invoker=true) AS ' || rtrim(n, E'; \n');
END $do$;