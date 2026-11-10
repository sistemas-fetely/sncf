DO $migration$
DECLARE f text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO f FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='fn_mesa_sp_marcar_documento';
  IF position('on conflict (pedido_id, documento_id) do nothing' in f) = 0 THEN RAISE EXCEPTION 'Marcação de documentos mudou; revisão necessária.'; END IF;
  f := replace(f, 'on conflict (pedido_id, documento_id) do nothing', 'on conflict (pedido_id, documento_id) do update set marcado_em = now(), marcado_por = auth.uid()');
  EXECUTE f;
END $migration$;