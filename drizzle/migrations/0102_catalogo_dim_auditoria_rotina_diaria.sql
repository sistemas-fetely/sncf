DO $migration$
DECLARE
  v_assinatura text;
  v_definicao text;
  v_original text := 'VALUES ((p_quem->>''id'')::uuid,p_quem->>''nome'',';
  v_corrigido text := 'VALUES ((SELECT id FROM auth.users WHERE id = (p_quem->>''id'')::uuid),p_quem->>''nome'',';
BEGIN
  FOREACH v_assinatura IN ARRAY ARRAY[
    'public.fn_catalogo_dim_renomear_sncf(text,text,text,text[],jsonb,boolean)',
    'public.fn_catalogo_dim_inativar_se_vazio_sncf(text,text,jsonb)'
  ] LOOP
    SELECT pg_get_functiondef(v_assinatura::regprocedure) INTO v_definicao;
    IF position(v_original IN v_definicao) = 0 THEN
      RAISE EXCEPTION 'INSERT de auditoria esperado não encontrado em %', v_assinatura;
    END IF;
    EXECUTE replace(v_definicao, v_original, v_corrigido);
  END LOOP;
END $migration$;