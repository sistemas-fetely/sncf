DO $migration$
DECLARE
  v_definicao text;
  v_original text := 'VALUES(uid,''catalogo_planilha_''||p_acao,';
  v_corrigido text := 'VALUES((SELECT id FROM auth.users WHERE id = uid),''catalogo_planilha_''||p_acao,';
BEGIN
  SELECT pg_get_functiondef('public.fn_catalogo_resolver(uuid[],text,text,text,uuid)'::regprocedure) INTO v_definicao;
  IF position(v_original IN v_definicao) = 0 THEN RAISE EXCEPTION 'INSERT de auditoria esperado não encontrado em fn_catalogo_resolver.'; END IF;
  EXECUTE replace(v_definicao, v_original, v_corrigido);
END $migration$;