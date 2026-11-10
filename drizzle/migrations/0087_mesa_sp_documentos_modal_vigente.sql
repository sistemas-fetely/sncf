DO $migration$
DECLARE v text; f text;
BEGIN
  v := pg_get_viewdef('public.vw_mesa_sp_quadro'::regclass, true);
  IF position('pedido_eventos.tipo_evento ~~ ''mesa_%''::text' in v) = 0 THEN RAISE EXCEPTION 'Derivação da Mesa SP mudou; revisão necessária.'; END IF;
  v := replace(v, 'pedido_eventos.tipo_evento ~~ ''mesa_%''::text', 'pedido_eventos.tipo_evento ~~ ''mesa_%''::text AND (pedido_eventos.tipo_evento <> ''mesa_documentos_ok'' OR (pedido_eventos.metadata->>''modal'' = public.fn_mesa_sp_modal_do_pedido(u.id) AND pedido_eventos.criado_em > coalesce((SELECT max(mt.criado_em) FROM public.pedido_eventos mt WHERE mt.pedido_id = u.id AND mt.tipo_evento IN (''mesa_embalado'', ''mesa_modal_trocado'')), ''-infinity''::timestamptz)))');
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_mesa_sp_quadro WITH (security_invoker = true) AS ' || v;

  SELECT pg_get_functiondef(oid) INTO f FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='fn_mesa_sp_exigir_estacao_documentos';
  IF position('and e.criado_em > (select max(criado_em)' in f) = 0 THEN RAISE EXCEPTION 'Guarda de Documentos mudou; revisão necessária.'; END IF;
  f := replace(f, 'and e.criado_em > (select max(criado_em) from pedido_eventos where pedido_id = p_pedido_id and tipo_evento = ''mesa_embalado'')', 'and e.metadata->>''modal'' = public.fn_mesa_sp_modal_do_pedido(p_pedido_id) and e.criado_em > (select max(criado_em) from pedido_eventos where pedido_id = p_pedido_id and tipo_evento in (''mesa_embalado'', ''mesa_modal_trocado''))');
  EXECUTE f;

  SELECT pg_get_functiondef(oid) INTO f FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='fn_mesa_sp_documentos';
  IF position('m.documento_id = d.id' in f) = 0 THEN RAISE EXCEPTION 'Leitura de documentos mudou; revisão necessária.'; END IF;
  f := replace(f, 'm.documento_id = d.id', 'm.documento_id = d.id and m.marcado_em > coalesce((select max(mt.criado_em) from pedido_eventos mt where mt.pedido_id = p_pedido_id and mt.tipo_evento in (''mesa_embalado'', ''mesa_modal_trocado'')), ''-infinity''::timestamptz)');
  EXECUTE f;
END $migration$;