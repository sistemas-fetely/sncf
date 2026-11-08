CREATE TABLE public.catalogo_planilha_leitura (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lida_em timestamptz NOT NULL DEFAULT now(), origem text NOT NULL CHECK(origem IN ('cron','manual')), hash text, etag text, storage_path text, status text NOT NULL DEFAULT 'erro' CHECK(status IN ('sem_mudanca','layout_quebrado','erro','comparada','aplicada_parcial','aplicada')), totais jsonb NOT NULL DEFAULT '{}', erro text, ambiente text NOT NULL DEFAULT 'oficial' CHECK(ambiente IN ('oficial','teste')), origem_chave text NOT NULL DEFAULT 'microsoft_365', criado_por uuid
);
GRANT SELECT ON public.catalogo_planilha_leitura TO authenticated;
GRANT ALL ON public.catalogo_planilha_leitura TO service_role;
ALTER TABLE public.catalogo_planilha_leitura ENABLE ROW LEVEL SECURITY;
CREATE POLICY catalogo_leitura_ler ON public.catalogo_planilha_leitura FOR SELECT TO authenticated USING(public.usuario_tem_acao('acao.produto_importar_planilha_cadastro') OR public.usuario_tem_acao('acao.credenciais_integracao.gravar'));
CREATE TABLE public.catalogo_planilha_base (
 cod_cadastro text NOT NULL, campo text NOT NULL, valor jsonb, leitura_id uuid REFERENCES public.catalogo_planilha_leitura(id), atualizado_em timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(cod_cadastro,campo)
);
GRANT SELECT ON public.catalogo_planilha_base TO authenticated;
GRANT ALL ON public.catalogo_planilha_base TO service_role;
ALTER TABLE public.catalogo_planilha_base ENABLE ROW LEVEL SECURITY;
CREATE POLICY catalogo_base_ler ON public.catalogo_planilha_base FOR SELECT TO authenticated USING(public.usuario_tem_acao('acao.produto_importar_planilha_cadastro'));
CREATE TABLE public.catalogo_planilha_mudanca (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), leitura_id uuid NOT NULL REFERENCES public.catalogo_planilha_leitura(id), cod_cadastro text NOT NULL, campo text NOT NULL, dono text NOT NULL CHECK(dono IN ('operacoes','produto')), valor_base jsonb, valor_planilha jsonb, valor_sistema jsonb, tipo text NOT NULL CHECK(tipo IN ('mudanca','conflito','ja_igual','sem_cadastro','erro')), status text NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','aplicada','descartada','resolvida')), resolvido_por uuid, resolvido_em timestamptz, erro text, escolha text CHECK(escolha IN ('planilha','sistema')), UNIQUE(leitura_id,cod_cadastro,campo)
);
GRANT SELECT ON public.catalogo_planilha_mudanca TO authenticated;
GRANT ALL ON public.catalogo_planilha_mudanca TO service_role;
ALTER TABLE public.catalogo_planilha_mudanca ENABLE ROW LEVEL SECURITY;
CREATE POLICY catalogo_mudanca_ler ON public.catalogo_planilha_mudanca FOR SELECT TO authenticated USING(public.usuario_tem_acao('acao.produto_importar_planilha_cadastro'));
CREATE INDEX catalogo_mudanca_fila ON public.catalogo_planilha_mudanca(leitura_id,dono,status);
CREATE INDEX catalogo_leitura_ultima ON public.catalogo_planilha_leitura(ambiente,lida_em DESC);
CREATE FUNCTION public.fn_catalogo_m365_gravar(p_config jsonb,p_segredos jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE k text; v text;
BEGIN
 IF NOT public.usuario_tem_acao('acao.credenciais_integracao.gravar') THEN RAISE EXCEPTION 'Sem permissão para credenciais.'; END IF;
 IF p_config->>'site' !~ '^[a-zA-Z0-9.-]+\.sharepoint\.com:/sites/[a-zA-Z0-9_/-]+$' OR coalesce(p_config->>'aba','')='' OR coalesce(p_config->>'arquivo','')='' THEN RAISE EXCEPTION 'Informe site SharePoint, arquivo e aba válidos.'; END IF;
 FOR k,v IN SELECT * FROM jsonb_each_text(p_segredos) LOOP
  IF k NOT IN ('tenant_id','client_id','client_secret') THEN RAISE EXCEPTION 'Credencial não permitida: %',k; END IF;
  IF v<>'' THEN PERFORM public.fn_vault_gravar_segredo('m365_'||k,v,'Microsoft 365 — catálogo (somente leitura)'); END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM integracoes_config WHERE sistema='microsoft_365') THEN
  UPDATE integracoes_config SET config=jsonb_build_object('site',p_config->>'site','arquivo',p_config->>'arquivo','drive_id',p_config->>'drive_id','aba',p_config->>'aba'),ativo=true,updated_at=now() WHERE sistema='microsoft_365';
 ELSE INSERT INTO integracoes_config(sistema,config,ativo) VALUES('microsoft_365',jsonb_build_object('site',p_config->>'site','arquivo',p_config->>'arquivo','drive_id',p_config->>'drive_id','aba',p_config->>'aba'),true); END IF;
 INSERT INTO credenciais_integracao_log(nome,descricao,acao,por) VALUES('m365_config','Microsoft 365 — configuração do arquivo','atualizado',auth.uid());
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.fn_catalogo_m365_gravar(jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_catalogo_m365_gravar(jsonb,jsonb) TO authenticated;
CREATE FUNCTION public.fn_catalogo_leitura_concluir(p_leitura_id uuid,p_status text,p_totais jsonb,p_mudancas jsonb DEFAULT '[]',p_base_inicial jsonb DEFAULT '[]',p_erro text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l catalogo_planilha_leitura; x jsonb;
BEGIN
 IF current_user NOT IN ('postgres','service_role','supabase_admin') AND coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Somente serviço.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('catalogo_planilha'));
 SELECT * INTO STRICT l FROM catalogo_planilha_leitura WHERE id=p_leitura_id FOR UPDATE;
 IF l.ambiente='oficial' THEN
  FOR x IN SELECT * FROM jsonb_array_elements(p_base_inicial) LOOP
   INSERT INTO catalogo_planilha_base(cod_cadastro,campo,valor,leitura_id) VALUES(x->>'cod_cadastro',x->>'campo',x->'valor',l.id) ON CONFLICT DO NOTHING;
  END LOOP;
 END IF;
 INSERT INTO catalogo_planilha_mudanca(leitura_id,cod_cadastro,campo,dono,valor_base,valor_planilha,valor_sistema,tipo,status,erro,resolvido_em)
 SELECT l.id,x->>'cod_cadastro',x->>'campo',x->>'dono',x->'valor_base',x->'valor_planilha',x->'valor_sistema',x->>'tipo',CASE WHEN x->>'tipo'='ja_igual' THEN 'resolvida' ELSE 'pendente' END,x->>'erro',CASE WHEN x->>'tipo'='ja_igual' THEN now() END FROM jsonb_array_elements(p_mudancas) x;
 IF l.ambiente='oficial' THEN
  INSERT INTO catalogo_planilha_base(cod_cadastro,campo,valor,leitura_id)
  SELECT cod_cadastro,campo,valor_planilha,l.id FROM catalogo_planilha_mudanca WHERE leitura_id=l.id AND tipo='ja_igual'
  ON CONFLICT(cod_cadastro,campo) DO UPDATE SET valor=excluded.valor,leitura_id=excluded.leitura_id,atualizado_em=now();
 END IF;
 UPDATE catalogo_planilha_leitura SET status=p_status,totais=p_totais,erro=p_erro WHERE id=l.id;
 RETURN jsonb_build_object('ok',true,'id',l.id);
END $$;
REVOKE ALL ON FUNCTION public.fn_catalogo_leitura_concluir(uuid,text,jsonb,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_catalogo_leitura_concluir(uuid,text,jsonb,jsonb,jsonb,text) TO service_role;
CREATE FUNCTION public.fn_catalogo_resolver(p_ids uuid[],p_acao text,p_escolha text DEFAULT 'planilha',p_dono text DEFAULT 'operacoes',p_ator uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE m catalogo_planilha_mudanca; p sncf_produtos; antes jsonb; atual jsonb; alvo jsonb; patch jsonb; erros text; uid uuid:=auth.uid(); maquina boolean; n int:=0; resultados jsonb:='[]'; ultima uuid;
BEGIN
 maquina:=coalesce(auth.role(),'')='service_role';
 IF NOT maquina AND (p_dono<>'operacoes' OR NOT public.usuario_tem_acao('acao.produto_importar_planilha_cadastro')) THEN RAISE EXCEPTION 'Sem permissão para aplicar catálogo.'; END IF;
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
   UPDATE catalogo_planilha_mudanca SET status=CASE WHEN p_acao='descartar' THEN 'descartada' WHEN p_acao='resolver' THEN 'resolvida' ELSE 'aplicada' END,escolha=p_escolha,resolvido_por=uid,resolvido_em=now() WHERE id=m.id;
   -- Discard acknowledges the sheet value without changing the live product; unchanged
   -- subsequent sheets must not offer the same discarded cell again.
   INSERT INTO catalogo_planilha_base(cod_cadastro,campo,valor,leitura_id) VALUES(m.cod_cadastro,m.campo,m.valor_planilha,m.leitura_id)
    ON CONFLICT(cod_cadastro,campo) DO UPDATE SET valor=excluded.valor,leitura_id=excluded.leitura_id,atualizado_em=now();
   INSERT INTO audit_log(user_id,acao,tabela,registro_id,dados_antes,dados_depois,justificativa) VALUES(uid,'catalogo_planilha_'||p_acao,'sncf_produtos',m.cod_cadastro,jsonb_build_object(m.campo,atual),jsonb_build_object(m.campo,alvo),'Leitura '||m.leitura_id||' / '||p_dono);
   resultados:=resultados||jsonb_build_array(jsonb_build_object('id',m.id,'ok',true)); n:=n+1;
  EXCEPTION WHEN OTHERS THEN resultados:=resultados||jsonb_build_array(jsonb_build_object('id',m.id,'ok',false,'erro',SQLERRM)); END;
 END LOOP;
 IF (SELECT count(*) FROM catalogo_planilha_mudanca WHERE id=ANY(p_ids))<>cardinality(p_ids) THEN RAISE EXCEPTION 'Seleção contém ID inexistente ou repetido.'; END IF;
 UPDATE catalogo_planilha_leitura SET status=CASE WHEN EXISTS(SELECT 1 FROM catalogo_planilha_mudanca WHERE leitura_id=ultima AND status='pendente') THEN 'aplicada_parcial' ELSE 'aplicada' END WHERE id=ultima AND n>0;
 RETURN jsonb_build_object('ok',n=cardinality(p_ids),'feitas',n,'resultados',resultados);
END $$;
REVOKE ALL ON FUNCTION public.fn_catalogo_resolver(uuid[],text,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_catalogo_resolver(uuid[],text,text,text,uuid) TO authenticated,service_role;
CREATE VIEW public.vw_catalogo_planilha_operacoes_pendente WITH(security_invoker=true) AS SELECT m.id,m.tipo,l.lida_em AS desde FROM catalogo_planilha_mudanca m JOIN catalogo_planilha_leitura l ON l.id=m.leitura_id WHERE l.ambiente='oficial' AND m.leitura_id=(SELECT id FROM catalogo_planilha_leitura WHERE ambiente='oficial' AND status IN ('comparada','aplicada_parcial','aplicada') ORDER BY lida_em DESC LIMIT 1) AND m.dono='operacoes' AND m.status='pendente';
CREATE VIEW public.vw_catalogo_planilha_produto_pendente WITH(security_invoker=true) AS SELECT m.id,m.tipo,l.lida_em AS desde FROM catalogo_planilha_mudanca m JOIN catalogo_planilha_leitura l ON l.id=m.leitura_id WHERE l.ambiente='oficial' AND m.leitura_id=(SELECT id FROM catalogo_planilha_leitura WHERE ambiente='oficial' AND status IN ('comparada','aplicada_parcial','aplicada') ORDER BY lida_em DESC LIMIT 1) AND m.dono='produto' AND m.status='pendente';
GRANT SELECT ON public.vw_catalogo_planilha_operacoes_pendente,public.vw_catalogo_planilha_produto_pendente TO authenticated,service_role;
COMMENT ON TABLE public.catalogo_planilha_base IS 'Base por célula reconhecida/aplicada; primeira base é estado vivo do SNCF. Nunca a planilha anterior.';