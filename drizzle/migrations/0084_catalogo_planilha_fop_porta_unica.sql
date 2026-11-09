-- Mapa v2: uma tela aplica tudo. Produto (dono 'produto') só é aplicado/resolvido-para-planilha pelo serviço depois do FOP aceitar;
-- o usuário pode descartar ou escolher "sistema" em células de Produto (não toca o FOP nem sncf_produtos).
CREATE OR REPLACE FUNCTION public.fn_catalogo_resolver(p_ids uuid[], p_acao text, p_escolha text DEFAULT 'planilha'::text, p_dono text DEFAULT 'operacoes'::text, p_ator uuid DEFAULT NULL::uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE m catalogo_planilha_mudanca; p sncf_produtos; antes jsonb; atual jsonb; alvo jsonb; patch jsonb; erros text; uid uuid:=auth.uid(); maquina boolean; n int:=0; resultados jsonb:='[]'; ultima uuid;
BEGIN
 maquina:=coalesce(auth.role(),'')='service_role';
 IF NOT maquina AND (p_dono NOT IN ('operacoes','produto') OR NOT public.usuario_tem_acao('acao.produto_importar_planilha_cadastro')) THEN RAISE EXCEPTION 'Sem permissão para aplicar catálogo.'; END IF;
 IF NOT maquina AND p_dono='produto' AND p_acao<>'descartar' AND p_escolha<>'sistema' THEN RAISE EXCEPTION 'Campos de Produto são aplicados pelo FOP.'; END IF;
 IF maquina THEN uid:=p_ator; END IF;
 IF uid IS NULL THEN RAISE EXCEPTION 'Autor obrigatório.'; END IF;
 IF p_acao NOT IN ('aplicar','descartar','resolver') OR p_escolha NOT IN ('planilha','sistema') OR coalesce(cardinality(p_ids),0)=0 OR cardinality(p_ids)>2000 THEN RAISE EXCEPTION 'Decisão ou seleção inválida.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('catalogo_planilha'));
 SELECT id INTO ultima FROM catalogo_planilha_leitura WHERE ambiente='oficial' AND status IN ('comparada','aplicada_parcial','aplicada') ORDER BY lida_em DESC LIMIT 1;
 FOR m IN SELECT * FROM catalogo_planilha_mudanca WHERE id=ANY(p_ids) ORDER BY cod_cadastro,campo FOR UPDATE LOOP
  BEGIN
   IF m.leitura_id<>ultima OR m.dono<>p_dono OR m.tipo NOT IN ('mudanca','conflito') OR m.status<>'pendente' THEN RAISE EXCEPTION 'Mudança não está pendente na última leitura desse time.'; END IF;
   IF m.campo IN ('fase','ativo','sku','ean','dun','cod_cadastro') THEN RAISE EXCEPTION 'Campo protegido.'; END IF;
   SELECT * INTO STRICT p FROM sncf_produtos WHERE cod_cadastro=m.cod_cadastro FOR UPDATE;
   antes:=to_jsonb(p); atual:=antes->m.campo;
   IF p_dono='operacoes' AND m.campo NOT IN ('ncm','cest','origem_fisc','origem_prod') THEN RAISE EXCEPTION 'Campo não pertence a Operações.'; END IF;
   IF p_acao='aplicar' AND m.tipo='conflito' THEN RAISE EXCEPTION 'Escolha planilha ou sistema para resolver o conflito.'; END IF;
   IF p_acao<>'descartar' AND p_escolha='planilha' AND p_dono='operacoes' AND atual IS DISTINCT FROM m.valor_sistema AND atual IS DISTINCT FROM m.valor_planilha THEN RAISE EXCEPTION 'Sistema mudou após a prévia. Leia novamente.'; END IF;
   alvo:=CASE WHEN p_acao='descartar' OR p_escolha='sistema' THEN atual ELSE m.valor_planilha END;
   IF p_dono='operacoes' AND p_acao<>'descartar' AND p_escolha='planilha' THEN
    patch:=jsonb_build_object(m.campo,alvo);
    SELECT string_agg(v.motivo,'; ') INTO erros FROM fn_produto_formato_validar_patch(m.cod_cadastro,patch) v;
    IF erros IS NOT NULL THEN RAISE EXCEPTION '%',erros; END IF;
    p:=jsonb_populate_record(p,patch);
    EXECUTE format('UPDATE public.sncf_produtos SET %I=($1).%I,atualizado_em=now() WHERE cod_cadastro=$2',m.campo,m.campo) USING p,m.cod_cadastro;
   END IF;
   UPDATE catalogo_planilha_mudanca SET status=CASE WHEN p_acao='descartar' THEN 'descartada' WHEN p_acao='resolver' THEN 'resolvida' ELSE 'aplicada' END,escolha=p_escolha,erro=NULL,resolvido_por=uid,resolvido_em=now() WHERE id=m.id;
   INSERT INTO catalogo_planilha_base(cod_cadastro,campo,valor,leitura_id) VALUES(m.cod_cadastro,m.campo,m.valor_planilha,m.leitura_id)
    ON CONFLICT(cod_cadastro,campo) DO UPDATE SET valor=excluded.valor,leitura_id=excluded.leitura_id,atualizado_em=now();
   INSERT INTO audit_log(user_id,acao,tabela,registro_id,dados_antes,dados_depois,justificativa) VALUES(uid,'catalogo_planilha_'||p_acao,'sncf_produtos',m.cod_cadastro,jsonb_build_object(m.campo,atual),jsonb_build_object(m.campo,alvo),'Leitura '||m.leitura_id||' / '||p_dono||CASE WHEN p_dono='produto' AND p_escolha='planilha' AND p_acao<>'descartar' THEN ' / gravado no FOP' ELSE '' END);
   resultados:=resultados||jsonb_build_array(jsonb_build_object('id',m.id,'ok',true)); n:=n+1;
  EXCEPTION WHEN OTHERS THEN resultados:=resultados||jsonb_build_array(jsonb_build_object('id',m.id,'ok',false,'erro',SQLERRM)); END;
 END LOOP;
 IF (SELECT count(*) FROM catalogo_planilha_mudanca WHERE id=ANY(p_ids))<>cardinality(p_ids) THEN RAISE EXCEPTION 'Seleção contém ID inexistente ou repetido.'; END IF;
 UPDATE catalogo_planilha_leitura SET status=CASE WHEN EXISTS(SELECT 1 FROM catalogo_planilha_mudanca WHERE leitura_id=ultima AND status='pendente') THEN 'aplicada_parcial' ELSE 'aplicada' END WHERE id=ultima AND n>0;
 RETURN jsonb_build_object('ok',n=cardinality(p_ids),'feitas',n,'resultados',resultados);
END $function$;
REVOKE ALL ON FUNCTION public.fn_catalogo_resolver(uuid[],text,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_catalogo_resolver(uuid[],text,text,text,uuid) TO authenticated,service_role;

-- Records non-success FOP answers: conflito keeps the cell pending as conflict with the FOP's current value; erro keeps it pending with the message.
CREATE OR REPLACE FUNCTION public.fn_catalogo_fop_registrar(p_resultados jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE x jsonb; n int:=0;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' AND current_user NOT IN ('postgres','service_role','supabase_admin') THEN RAISE EXCEPTION 'Somente serviço.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('catalogo_planilha'));
 FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p_resultados,'[]')) LOOP
  IF x->>'status'='conflito' THEN
   UPDATE catalogo_planilha_mudanca SET tipo='conflito',valor_sistema=x->'valor_atual',erro=NULL WHERE id=(x->>'id')::uuid AND dono='produto' AND status='pendente';
  ELSIF x->>'status'='erro' THEN
   UPDATE catalogo_planilha_mudanca SET erro=left(coalesce(nullif(x->>'erro',''),'FOP recusou sem mensagem.'),1000) WHERE id=(x->>'id')::uuid AND dono='produto' AND status='pendente';
  ELSE RAISE EXCEPTION 'Resultado inválido: %',x->>'status'; END IF;
  IF FOUND THEN n:=n+1; END IF;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'registradas',n);
END $$;
REVOKE ALL ON FUNCTION public.fn_catalogo_fop_registrar(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_catalogo_fop_registrar(jsonb) TO service_role;

-- FOP base URL is non-secret config edited in TI › Integrações.
CREATE OR REPLACE FUNCTION public.fn_catalogo_fop_url_gravar(p_url text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.usuario_tem_acao('acao.credenciais_integracao.gravar') THEN RAISE EXCEPTION 'Sem permissão para integrações.'; END IF;
 IF coalesce(p_url,'') !~ '^https://[a-zA-Z0-9.-]+(:[0-9]+)?$' THEN RAISE EXCEPTION 'Informe a URL do FOP como https://endereco (sem barra final).'; END IF;
 INSERT INTO integracoes_config(sistema,config,ativo) VALUES('fop',jsonb_build_object('fop_base_url',p_url),true)
  ON CONFLICT(sistema) DO UPDATE SET config=coalesce(integracoes_config.config,'{}')||jsonb_build_object('fop_base_url',p_url),updated_at=now();
 INSERT INTO credenciais_integracao_log(nome,descricao,acao,por) VALUES('fop_base_url','FOP — endereço da porta do catálogo','atualizado',auth.uid());
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.fn_catalogo_fop_url_gravar(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_catalogo_fop_url_gravar(text) TO authenticated;

INSERT INTO integracoes_config(sistema,config,ativo) VALUES('fop',jsonb_build_object('fop_base_url','https://fetely-catalog-pro.lovable.app'),true)
 ON CONFLICT(sistema) DO UPDATE SET config=coalesce(integracoes_config.config,'{}')||jsonb_build_object('fop_base_url',coalesce(integracoes_config.config->>'fop_base_url','https://fetely-catalog-pro.lovable.app'));

-- Single queue for both owners.
CREATE VIEW public.vw_catalogo_planilha_pendente WITH(security_invoker=true) AS SELECT m.id,m.tipo,m.dono,l.lida_em AS desde FROM catalogo_planilha_mudanca m JOIN catalogo_planilha_leitura l ON l.id=m.leitura_id WHERE l.ambiente='oficial' AND m.leitura_id=(SELECT id FROM catalogo_planilha_leitura WHERE ambiente='oficial' AND status IN ('comparada','aplicada_parcial','aplicada') ORDER BY lida_em DESC LIMIT 1) AND m.dono IN ('operacoes','produto') AND m.tipo IN ('mudanca','conflito','erro') AND m.status='pendente';
GRANT SELECT ON public.vw_catalogo_planilha_pendente TO authenticated,service_role;
UPDATE tarefas_filas SET nome='Catálogo — planilha',fonte_contagem='vw_catalogo_planilha_pendente',rota='/vendas/produto/conciliacao?aba=entrada',updated_at=now() WHERE chave='catalogo_planilha_operacoes';
UPDATE tarefas_filas SET ativo=false,updated_at=now() WHERE chave='catalogo_planilha_produto';
COMMENT ON VIEW public.vw_catalogo_planilha_produto_pendente IS 'DEPRECATED: replaced by vw_catalogo_planilha_pendente';
COMMENT ON VIEW public.vw_catalogo_planilha_operacoes_pendente IS 'DEPRECATED: replaced by vw_catalogo_planilha_pendente';