DO $migration$
DECLARE
  v_definicao text;
  v_original text := $old$  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE public.fn_dim_chave(rotulo) = public.fn_dim_chave($1))',p_tabela) INTO v_existe USING v_destino;
  IF v_existe THEN RETURN jsonb_build_object('renomeado',false,'motivo','destino_existe'); END IF;
  EXECUTE format('SELECT codigo, coalesce(variantes,''{}''::text[]) FROM public.%I WHERE rotulo=$1 FOR UPDATE',p_tabela) INTO v_codigo,v_variantes USING v_origem;
  IF v_codigo IS NULL THEN RETURN jsonb_build_object('renomeado',false,'motivo','nao_encontrado'); END IF;$old$;
  v_corrigido text := $new$  EXECUTE format('SELECT codigo, coalesce(variantes,''{}''::text[]) FROM public.%I WHERE rotulo=$1 FOR UPDATE',p_tabela) INTO v_codigo,v_variantes USING v_origem;
  IF v_codigo IS NULL THEN RETURN jsonb_build_object('renomeado',false,'motivo','nao_encontrado'); END IF;
  -- Ignore the source dimension for both forward rename and compensation, including its variants.
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I d WHERE d.codigo <> $2 AND (public.fn_dim_chave(d.rotulo) = public.fn_dim_chave($1) OR EXISTS (SELECT 1 FROM unnest(coalesce(d.variantes,''{}''::text[])) AS v(variante) WHERE public.fn_dim_chave(v.variante) = public.fn_dim_chave($1))))',p_tabela) INTO v_existe USING v_destino,v_codigo;
  IF v_existe THEN RETURN jsonb_build_object('renomeado',false,'motivo','destino_existe'); END IF;$new$;
BEGIN
  SELECT pg_get_functiondef('public.fn_catalogo_dim_renomear_sncf(text,text,text,text[],jsonb,boolean)'::regprocedure) INTO v_definicao;
  IF position(v_original IN v_definicao) = 0 THEN RAISE EXCEPTION 'Checagem de destino esperada não encontrada.'; END IF;
  EXECUTE replace(v_definicao,v_original,v_corrigido);
END $migration$;