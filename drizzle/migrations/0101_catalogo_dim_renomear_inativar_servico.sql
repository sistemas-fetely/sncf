CREATE OR REPLACE FUNCTION public.fn_catalogo_dim_renomear_sncf(p_tabela text, p_de text, p_para text, p_cods text[], p_quem jsonb, p_desfazer boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_campo text; v_origem text; v_destino text; v_codigo text; v_variantes text[];
  v_cods text[]; v_esperados text[]; v_existe boolean; v_variante text; v_adicionada boolean;
  v_audit jsonb; v_depois text[];
BEGIN
  IF p_tabela NOT IN ('produto_grupo_dim','produto_colecao_cad_dim') OR p_tabela IS NULL THEN RAISE EXCEPTION 'Tabela de dimensão não permitida.'; END IF;
  IF nullif(btrim(p_de),'') IS NULL OR nullif(btrim(p_para),'') IS NULL OR coalesce(public.fn_dim_chave(p_para),'') = '' OR coalesce(public.fn_dim_chave(p_de),'') = '' THEN RAISE EXCEPTION 'Nomes de origem e destino obrigatórios.'; END IF;
  IF p_cods IS NULL OR cardinality(p_cods) = 0 OR array_position(p_cods,NULL) IS NOT NULL THEN RAISE EXCEPTION 'Lista de produtos obrigatória e sem códigos nulos.'; END IF;
  IF nullif(p_quem->>'id','') IS NULL OR nullif(p_quem->>'nome','') IS NULL THEN RAISE EXCEPTION 'Responsável pela alteração obrigatório.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('catalogo_planilha'));
  -- Fence product membership as well as dimension writes, including concurrent non-feed writers.
  LOCK TABLE public.sncf_produtos IN SHARE ROW EXCLUSIVE MODE;
  EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE', p_tabela);
  v_campo := CASE p_tabela WHEN 'produto_grupo_dim' THEN 'grupo' ELSE 'colecao' END;
  v_origem := CASE WHEN p_desfazer THEN p_para ELSE p_de END;
  v_destino := CASE WHEN p_desfazer THEN p_de ELSE p_para END;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE public.fn_dim_chave(rotulo) = public.fn_dim_chave($1))',p_tabela) INTO v_existe USING v_destino;
  IF v_existe THEN RETURN jsonb_build_object('renomeado',false,'motivo','destino_existe'); END IF;
  EXECUTE format('SELECT codigo, coalesce(variantes,''{}''::text[]) FROM public.%I WHERE rotulo=$1 FOR UPDATE',p_tabela) INTO v_codigo,v_variantes USING v_origem;
  IF v_codigo IS NULL THEN RETURN jsonb_build_object('renomeado',false,'motivo','nao_encontrado'); END IF;
  EXECUTE format('SELECT coalesce(array_agg(DISTINCT cod_cadastro ORDER BY cod_cadastro),''{}''::text[]) FROM public.sncf_produtos WHERE %I=$1',v_campo) INTO v_cods USING v_origem;
  SELECT array_agg(DISTINCT cod ORDER BY cod) INTO v_esperados FROM unnest(p_cods) cod;
  IF v_cods IS DISTINCT FROM v_esperados THEN RETURN jsonb_build_object('renomeado',false,'motivo','parcial'); END IF;
  v_variante := lower(public.unaccent_simples(p_de));
  v_adicionada := NOT (v_variante = ANY(v_variantes));
  IF p_desfazer THEN
    SELECT dados_depois INTO v_audit FROM public.audit_log
    WHERE acao='catalogo_dim_renomear' AND tabela=p_tabela AND registro_id=v_codigo
      AND dados_antes->>'rotulo'=p_de AND dados_depois->>'rotulo'=p_para
    ORDER BY created_at DESC LIMIT 1;
    IF v_audit IS NULL THEN RAISE EXCEPTION 'Renomeação original não encontrada para desfazer com segurança.'; END IF;
    v_depois := CASE WHEN (v_audit->>'variante_acrescentada')::boolean THEN array_remove(v_variantes,v_variante) ELSE v_variantes END;
  ELSE
    v_depois := CASE WHEN v_adicionada THEN array_append(v_variantes,v_variante) ELSE v_variantes END;
  END IF;
  -- FK ON UPDATE CASCADE changes only grupo/colecao on the linked products.
  EXECUTE format('UPDATE public.%I SET rotulo=$1, variantes=$2 WHERE codigo=$3',p_tabela) USING v_destino,v_depois,v_codigo;
  INSERT INTO public.audit_log(user_id,user_nome,acao,tabela,registro_id,dados_antes,dados_depois,justificativa)
  VALUES ((p_quem->>'id')::uuid,p_quem->>'nome',CASE WHEN p_desfazer THEN 'catalogo_dim_renomear_desfazer' ELSE 'catalogo_dim_renomear' END,p_tabela,v_codigo,
    jsonb_build_object('rotulo',v_origem,'variantes',v_variantes),
    jsonb_build_object('rotulo',v_destino,'variantes',v_depois,'variante_acrescentada',v_adicionada,'cod_cadastros',v_cods),
    'Planilha do catálogo: '||CASE WHEN p_desfazer THEN 'compensação de renomeação' ELSE 'renomeação integral' END);
  RETURN jsonb_build_object('renomeado',true,'codigo',v_codigo,'nome',v_destino,'produtos',cardinality(v_cods));
END $function$;
REVOKE ALL ON FUNCTION public.fn_catalogo_dim_renomear_sncf(text,text,text,text[],jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_catalogo_dim_renomear_sncf(text,text,text,text[],jsonb,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_catalogo_dim_inativar_se_vazio_sncf(p_tabela text,p_rotulo text,p_quem jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_campo text; v_codigo text; v_ativo boolean; v_tem boolean;
BEGIN
  IF p_tabela NOT IN ('produto_grupo_dim','produto_colecao_cad_dim') OR p_tabela IS NULL THEN RAISE EXCEPTION 'Tabela de dimensão não permitida.'; END IF;
  IF nullif(btrim(p_rotulo),'') IS NULL THEN RAISE EXCEPTION 'Rótulo da dimensão obrigatório.'; END IF;
  IF nullif(p_quem->>'id','') IS NULL OR nullif(p_quem->>'nome','') IS NULL THEN RAISE EXCEPTION 'Responsável pela alteração obrigatório.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('catalogo_planilha'));
  LOCK TABLE public.sncf_produtos IN SHARE ROW EXCLUSIVE MODE;
  EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE',p_tabela);
  v_campo := CASE p_tabela WHEN 'produto_grupo_dim' THEN 'grupo' ELSE 'colecao' END;
  EXECUTE format('SELECT codigo,ativo FROM public.%I WHERE rotulo=$1 FOR UPDATE',p_tabela) INTO v_codigo,v_ativo USING p_rotulo;
  IF v_codigo IS NULL THEN RETURN jsonb_build_object('inativado',false,'motivo','nao_encontrado'); END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.sncf_produtos WHERE %I=$1)',v_campo) INTO v_tem USING p_rotulo;
  IF v_tem THEN RETURN jsonb_build_object('inativado',false,'motivo','tem_produtos'); END IF;
  IF v_ativo IS FALSE THEN RETURN jsonb_build_object('inativado',false,'motivo','ja_inativo'); END IF;
  EXECUTE format('UPDATE public.%I SET ativo=false WHERE codigo=$1',p_tabela) USING v_codigo;
  INSERT INTO public.audit_log(user_id,user_nome,acao,tabela,registro_id,dados_antes,dados_depois,justificativa)
  VALUES ((p_quem->>'id')::uuid,p_quem->>'nome','catalogo_dim_inativar_se_vazio',p_tabela,v_codigo,jsonb_build_object('rotulo',p_rotulo,'ativo',v_ativo),jsonb_build_object('rotulo',p_rotulo,'ativo',false),'Planilha do catálogo: dimensão perdeu o último produto');
  RETURN jsonb_build_object('inativado',true,'codigo',v_codigo);
END $function$;
REVOKE ALL ON FUNCTION public.fn_catalogo_dim_inativar_se_vazio_sncf(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_catalogo_dim_inativar_se_vazio_sncf(text,text,jsonb) TO service_role;