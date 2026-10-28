-- MESA-SP-SERVICO-CORREIOS (28/10/2026): rastreio bipado no despacho (agência) também leva servico e frete_cliente_valor.
DO $do$
DECLARE v_def text; v_old text := $o$jsonb_build_object('codigo', v_cod, 'origem', 'despacho_agencia', 'auth_uid', auth.uid())$o$;
BEGIN
  SELECT pg_get_functiondef('public.fn_mesa_sp_despachar(uuid,text,text,text)'::regprocedure) INTO v_def;
  IF position(v_old in v_def) = 0 THEN RAISE EXCEPTION 'trecho do rastreio não encontrado em fn_mesa_sp_despachar'; END IF;
  v_def := replace(v_def, v_old,
    $n$jsonb_build_object('codigo', v_cod, 'origem', 'despacho_agencia', 'auth_uid', auth.uid(), 'servico', public.fn_mesa_sp_servico_correios(p_pedido_id)->>'servico', 'frete_cliente_valor', (public.fn_mesa_sp_servico_correios(p_pedido_id)->>'frete_cliente_valor')::numeric)$n$);
  EXECUTE v_def;
END $do$;