-- Run ONLY in an empty disposable PostgreSQL database, never in the hosted app.
\set ON_ERROR_STOP on
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000001');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('teste.uid', true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('teste.role', true) $$;
CREATE FUNCTION public.usuario_tem_acao(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE TABLE public.sncf_produtos(cod_cadastro text PRIMARY KEY, categoria text);
CREATE TABLE public.catalogo_planilha_leitura(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lida_em timestamptz NOT NULL DEFAULT now(), status text NOT NULL, ambiente text NOT NULL DEFAULT 'oficial');
CREATE TABLE public.catalogo_planilha_mudanca(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), leitura_id uuid NOT NULL REFERENCES public.catalogo_planilha_leitura(id), cod_cadastro text NOT NULL, campo text NOT NULL, dono text NOT NULL, valor_base jsonb, valor_planilha jsonb, valor_sistema jsonb, tipo text NOT NULL, status text NOT NULL DEFAULT 'pendente', resolvido_por uuid, resolvido_em timestamptz, erro text, escolha text);
CREATE TABLE public.catalogo_planilha_base(cod_cadastro text, campo text, valor jsonb, leitura_id uuid REFERENCES public.catalogo_planilha_leitura(id), atualizado_em timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(cod_cadastro,campo));
CREATE TABLE public.audit_log(created_at timestamptz DEFAULT clock_timestamp(), user_id uuid REFERENCES auth.users(id), user_nome text, acao text, tabela text, registro_id text, dados_antes jsonb, dados_depois jsonb, justificativa text);

-- Hosted definition before migration 0104 (fixture copied from the live database).
CREATE OR REPLACE FUNCTION public.fn_catalogo_resolver(p_ids uuid[], p_acao text, p_escolha text DEFAULT 'planilha'::text, p_dono text DEFAULT 'operacoes'::text, p_ator uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE m catalogo_planilha_mudanca; p sncf_produtos; antes jsonb; atual jsonb; alvo jsonb; patch jsonb; erros text; uid uuid:=auth.uid(); maquina boolean; n int:=0; resultados jsonb:='[]'; ultima uuid;
BEGIN
 maquina:=coalesce(auth.role(),'')='service_role';
 IF NOT maquina AND (p_dono NOT IN ('operacoes','produto') OR NOT public.usuario_tem_acao('acao.produto_importar_planilha_cadastro')) THEN RAISE EXCEPTION 'Sem permissão para aplicar catálogo.'; END IF;
 IF NOT maquina AND p_acao<>'descartar' AND p_escolha<>'sistema' THEN RAISE EXCEPTION 'Campos de Produto e fiscais são aplicados pelo FOP.'; END IF;
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
   alvo:=CASE WHEN p_acao='descartar' OR p_escolha='sistema' THEN atual ELSE m.valor_planilha END;
   -- Mapa v2: Produto e fiscais são gravados no FOP; o SNCF só registra depois que o FOP responde.
   UPDATE catalogo_planilha_mudanca SET status=CASE WHEN p_acao='descartar' THEN 'descartada' WHEN p_acao='resolver' THEN 'resolvida' ELSE 'aplicada' END,escolha=p_escolha,erro=NULL,resolvido_por=uid,resolvido_em=now() WHERE id=m.id;
   INSERT INTO catalogo_planilha_base(cod_cadastro,campo,valor,leitura_id) VALUES(m.cod_cadastro,m.campo,m.valor_planilha,m.leitura_id)
    ON CONFLICT(cod_cadastro,campo) DO UPDATE SET valor=excluded.valor,leitura_id=excluded.leitura_id,atualizado_em=now();
   INSERT INTO audit_log(user_id,acao,tabela,registro_id,dados_antes,dados_depois,justificativa) VALUES(uid,'catalogo_planilha_'||p_acao,'sncf_produtos',m.cod_cadastro,jsonb_build_object(m.campo,atual),jsonb_build_object(m.campo,alvo),'Leitura '||m.leitura_id||' / '||p_dono||CASE WHEN p_escolha='planilha' AND p_acao<>'descartar' THEN ' / gravado no FOP' ELSE '' END);
   resultados:=resultados||jsonb_build_array(jsonb_build_object('id',m.id,'ok',true)); n:=n+1;
  EXCEPTION WHEN OTHERS THEN resultados:=resultados||jsonb_build_array(jsonb_build_object('id',m.id,'ok',false,'erro',SQLERRM)); END;
 END LOOP;
 IF (SELECT count(*) FROM catalogo_planilha_mudanca WHERE id=ANY(p_ids))<>cardinality(p_ids) THEN RAISE EXCEPTION 'Seleção contém ID inexistente ou repetido.'; END IF;
 UPDATE catalogo_planilha_leitura SET status=CASE WHEN EXISTS(SELECT 1 FROM catalogo_planilha_mudanca WHERE leitura_id=ultima AND status='pendente') THEN 'aplicada_parcial' ELSE 'aplicada' END WHERE id=ultima AND n>0;
 RETURN jsonb_build_object('ok',n=cardinality(p_ids),'feitas',n,'resultados',resultados);
END $function$;
\ir ../../../drizzle/migrations/0104_catalogo_resolver_auditoria_rotina_diaria.sql

CREATE FUNCTION public.verificar(condicao boolean,cenario text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condicao IS DISTINCT FROM true THEN RAISE EXCEPTION 'FALHOU: %',cenario; END IF; RAISE NOTICE 'PASSOU: %',cenario; END $$;

INSERT INTO sncf_produtos VALUES ('P1','Velha'),('P2','Velha');
INSERT INTO catalogo_planilha_leitura(id,status) VALUES ('00000000-0000-0000-0000-00000000000a','comparada');
INSERT INTO catalogo_planilha_mudanca(id,leitura_id,cod_cadastro,campo,dono,valor_planilha,tipo) VALUES
 ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-00000000000a','P1','categoria','produto','"Nova"','mudanca'),
 ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-00000000000a','P2','categoria','produto','"Nova"','mudanca');
SELECT set_config('teste.role','service_role',false);

DO $$
DECLARE r jsonb;
BEGIN
  r := public.fn_catalogo_resolver(ARRAY['00000000-0000-0000-0000-0000000000c1'::uuid],'aplicar','planilha','produto','00000000-0000-4000-8000-00000000ca7a');
  PERFORM public.verificar((r->>'ok')::boolean AND (r->>'feitas')::int=1,'rotina diária conclui célula sem erro');
  PERFORM public.verificar((SELECT status='aplicada' AND resolvido_por='00000000-0000-4000-8000-00000000ca7a'::uuid FROM catalogo_planilha_mudanca WHERE cod_cadastro='P1'),'célula registra a rotina como responsável');
  PERFORM public.verificar((SELECT user_id IS NULL FROM audit_log WHERE registro_id='P1'),'auditoria da rotina grava user_id NULL');
  r := public.fn_catalogo_resolver(ARRAY['00000000-0000-0000-0000-0000000000c2'::uuid],'aplicar','planilha','produto','00000000-0000-4000-8000-000000000001');
  PERFORM public.verificar((r->>'ok')::boolean AND (SELECT user_id='00000000-0000-4000-8000-000000000001'::uuid FROM audit_log WHERE registro_id='P2'),'usuário real preservado na auditoria');
  PERFORM public.verificar((SELECT status='aplicada' FROM catalogo_planilha_leitura),'leitura concluída');
END $$;
