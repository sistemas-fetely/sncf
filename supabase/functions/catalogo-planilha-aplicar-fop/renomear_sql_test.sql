-- Run ONLY in an empty disposable PostgreSQL database, never in the hosted app.
\set ON_ERROR_STOP on
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000001');
CREATE FUNCTION public.unaccent_simples(x text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT translate(x,'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ','aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')
$$;
CREATE FUNCTION public.fn_dim_slug(x text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT lower(public.unaccent_simples(x)) $$;
CREATE TABLE public.produto_grupo_dim(codigo text PRIMARY KEY,rotulo text UNIQUE,variantes text[],ativo boolean DEFAULT true,ordem int DEFAULT 0,colecao_shopify text);
GRANT SELECT ON public.produto_grupo_dim TO authenticated;
GRANT ALL ON public.produto_grupo_dim TO service_role;
ALTER TABLE public.produto_grupo_dim ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.produto_colecao_cad_dim(codigo text PRIMARY KEY,rotulo text UNIQUE,variantes text[],ativo boolean DEFAULT true,ordem int DEFAULT 0,linha_codigo text,no_catalogo_2026 boolean,sigla_shopify text);
GRANT SELECT ON public.produto_colecao_cad_dim TO authenticated;
GRANT ALL ON public.produto_colecao_cad_dim TO service_role;
ALTER TABLE public.produto_colecao_cad_dim ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.sncf_produtos(cod_cadastro text PRIMARY KEY,grupo text REFERENCES public.produto_grupo_dim(rotulo) ON UPDATE CASCADE,colecao text REFERENCES public.produto_colecao_cad_dim(rotulo) ON UPDATE CASCADE);
GRANT SELECT ON public.sncf_produtos TO authenticated;
GRANT ALL ON public.sncf_produtos TO service_role;
ALTER TABLE public.sncf_produtos ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.audit_log(created_at timestamptz DEFAULT clock_timestamp(),user_id uuid REFERENCES auth.users(id),user_nome text,acao text,tabela text,registro_id text,dados_antes jsonb,dados_depois jsonb,justificativa text);
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.dimensao_auto_provisionada(tabela text,codigo text,rotulo text);
GRANT ALL ON public.dimensao_auto_provisionada TO service_role;
ALTER TABLE public.dimensao_auto_provisionada ENABLE ROW LEVEL SECURITY;
\ir ../../../drizzle/migrations/0100_catalogo_dim_chave_ordenada.sql
\ir ../../../drizzle/migrations/0101_catalogo_dim_renomear_inativar_servico.sql
\ir ../../../drizzle/migrations/0102_catalogo_dim_auditoria_rotina_diaria.sql

CREATE FUNCTION public.verificar(condicao boolean,cenario text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condicao IS DISTINCT FROM true THEN RAISE EXCEPTION 'FALHOU: %',cenario; END IF; RAISE NOTICE 'PASSOU: %',cenario; END $$;
SELECT public.verificar(fn_dim_chave('Butterfly - B&W')=fn_dim_chave('Butterfly -B&W'),'chave ignora hífen/espaço');
SELECT public.verificar(fn_dim_chave('Bianco & Oro')=fn_dim_chave('bianco e oro'),'chave ignora conectivo');
SELECT public.verificar(fn_dim_chave('Rosé Doux - Éclat')=fn_dim_chave('Rose Doux Eclat'),'chave ignora acentos');
SELECT public.verificar(fn_dim_chave('Dourado e Branco')<>fn_dim_chave('Branco e Dourado'),'chave mantém ordem');
SELECT public.verificar(fn_dim_chave('Azul Azul')<>fn_dim_chave('Azul'),'chave não deduplica termos');

INSERT INTO public.produto_grupo_dim VALUES ('g1','Travessa',ARRAY['louça'],true,10,'Travessas');
INSERT INTO public.produto_colecao_cad_dim VALUES ('c1','Éclat Oro',ARRAY['coleção antiga'],true,10,'linha-original',true,'SIGLA');
INSERT INTO public.sncf_produtos VALUES ('1','Travessa','Éclat Oro'),('2','Travessa','Éclat Oro');
SELECT public.verificar(fn_dim_resolver('produto_colecao_cad_dim','eclat & oro')='Éclat Oro','resolver casa chave antes de provisionar');
SELECT public.verificar((SELECT count(*)=0 FROM public.dimensao_auto_provisionada),'equivalência não provisiona');
INSERT INTO public.produto_grupo_dim VALUES ('var','Nome canônico',ARRAY['Pink & Cristal'],true,0,null);
SELECT public.verificar(fn_dim_resolver('produto_grupo_dim','Pink Cristal')='Nome canônico','resolver casa chave de variante');

DO $$
DECLARE quem jsonb := '{"id":"00000000-0000-4000-8000-000000000001","nome":"Teste isolado"}'; r jsonb; recusada boolean := false;
BEGIN
  r := public.fn_catalogo_dim_renomear_sncf('produto_grupo_dim','Travessa','Bandeja',ARRAY['1'],quem);
  PERFORM public.verificar(r->>'motivo'='parcial' AND (SELECT rotulo='Travessa' FROM produto_grupo_dim WHERE codigo='g1'),'parcial não grava');
  INSERT INTO produto_grupo_dim VALUES ('destino','Bandeja',ARRAY[]::text[],false,0,null);
  r := public.fn_catalogo_dim_renomear_sncf('produto_grupo_dim','Travessa','bandeja',ARRAY['1','2'],quem);
  PERFORM public.verificar(r->>'motivo'='destino_existe','destino equivalente mesmo inativo impede fusão');
  DELETE FROM produto_grupo_dim WHERE codigo='destino';
  r := public.fn_catalogo_dim_renomear_sncf('produto_grupo_dim','Travessa','Bandeja',ARRAY['2','1','1'],quem);
  PERFORM public.verificar((r->>'renomeado')::boolean AND (r->>'produtos')::int=2,'conjunto de códigos ignora ordem/duplicatas');
  PERFORM public.verificar((SELECT count(*)=2 FROM sncf_produtos WHERE grupo='Bandeja'),'FK atualiza produtos em cascata');
  PERFORM public.verificar((SELECT codigo='g1' AND colecao_shopify='Travessas' AND variantes=ARRAY['louça','travessa'] FROM produto_grupo_dim WHERE codigo='g1'),'preserva código/Shopify e acrescenta variante');
  PERFORM public.verificar((SELECT count(*)=1 FROM audit_log WHERE acao='catalogo_dim_renomear'),'renomeação auditada');
  PERFORM public.verificar((SELECT user_id='00000000-0000-4000-8000-000000000001'::uuid AND user_nome='Teste isolado' FROM audit_log WHERE acao='catalogo_dim_renomear'),'usuário real preservado na auditoria');
  r := public.fn_catalogo_dim_renomear_sncf('produto_grupo_dim','Travessa','Bandeja',ARRAY['1','2'],quem,true);
  PERFORM public.verificar((r->>'renomeado')::boolean AND (SELECT variantes=ARRAY['louça'] FROM produto_grupo_dim WHERE codigo='g1') AND (SELECT count(*)=2 FROM sncf_produtos WHERE grupo='Travessa'),'desfazer restaura produtos e remove só variante acrescentada');
  UPDATE produto_grupo_dim SET variantes=ARRAY['louça','travessa'] WHERE codigo='g1';
  PERFORM public.fn_catalogo_dim_renomear_sncf('produto_grupo_dim','Travessa','Bandeja',ARRAY['1','2'],quem);
  PERFORM public.fn_catalogo_dim_renomear_sncf('produto_grupo_dim','Travessa','Bandeja',ARRAY['1','2'],quem,true);
  PERFORM public.verificar((SELECT variantes=ARRAY['louça','travessa'] FROM produto_grupo_dim WHERE codigo='g1'),'desfazer preserva variante preexistente');
  r := public.fn_catalogo_dim_renomear_sncf('produto_colecao_cad_dim','Éclat Oro','Éclat Doré',ARRAY['1','2'],quem);
  PERFORM public.verificar((r->>'renomeado')::boolean AND (SELECT codigo='c1' AND linha_codigo='linha-original' AND sigla_shopify='SIGLA' AND no_catalogo_2026 FROM produto_colecao_cad_dim WHERE codigo='c1'),'coleção preserva linha/sigla/código');
  r := public.fn_catalogo_dim_inativar_se_vazio_sncf('produto_grupo_dim','Travessa',quem);
  PERFORM public.verificar(r->>'motivo'='tem_produtos' AND (SELECT ativo FROM produto_grupo_dim WHERE codigo='g1'),'dimensão com produto não inativa');
  UPDATE sncf_produtos SET grupo=null WHERE cod_cadastro IN ('1','2');
  r := public.fn_catalogo_dim_inativar_se_vazio_sncf('produto_grupo_dim','Travessa',quem);
  PERFORM public.verificar((r->>'inativado')::boolean AND (SELECT NOT ativo FROM produto_grupo_dim WHERE codigo='g1'),'último produto removido permite inativação');
  r := public.fn_catalogo_dim_inativar_se_vazio_sncf('produto_grupo_dim','Travessa',quem);
  PERFORM public.verificar(r->>'motivo'='ja_inativo','inativação idempotente');
  BEGIN
    PERFORM public.fn_catalogo_dim_renomear_sncf('audit_log','A','B',ARRAY['1'],quem);
    RAISE EXCEPTION 'Tabela arbitrária foi aceita';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'Tabela de dimensão não permitida.' THEN RAISE; END IF;
    recusada := true;
  END;
  PERFORM public.verificar(recusada,'tabela fora da allowlist recusada');
END $$;
DO $$
DECLARE quem jsonb := '{"id":"00000000-0000-4000-8000-00000000ca7a","nome":"Rotina diária do catálogo"}'; r jsonb;
BEGIN
  PERFORM public.verificar(NOT EXISTS(SELECT 1 FROM auth.users WHERE id=(quem->>'id')::uuid),'rotina diária não é usuário real');
  r := public.fn_catalogo_dim_renomear_sncf('produto_colecao_cad_dim','Éclat Doré','Éclat Novo',ARRAY['1','2'],quem);
  PERFORM public.verificar((r->>'renomeado')::boolean AND EXISTS(SELECT 1 FROM audit_log WHERE acao='catalogo_dim_renomear' AND dados_depois->>'rotulo'='Éclat Novo' AND user_id IS NULL AND user_nome='Rotina diária do catálogo'),'renomeação da rotina audita user_id NULL e nome');
  r := public.fn_catalogo_dim_renomear_sncf('produto_colecao_cad_dim','Éclat Doré','Éclat Novo',ARRAY['1','2'],quem,true);
  PERFORM public.verificar((r->>'renomeado')::boolean AND EXISTS(SELECT 1 FROM audit_log WHERE acao='catalogo_dim_renomear_desfazer' AND dados_antes->>'rotulo'='Éclat Novo' AND user_id IS NULL AND user_nome='Rotina diária do catálogo'),'compensação da rotina audita user_id NULL e nome');
  r := public.fn_catalogo_dim_inativar_se_vazio_sncf('produto_grupo_dim','Nome canônico',quem);
  PERFORM public.verificar((r->>'inativado')::boolean AND EXISTS(SELECT 1 FROM audit_log WHERE acao='catalogo_dim_inativar_se_vazio' AND registro_id='var' AND user_id IS NULL AND user_nome='Rotina diária do catálogo'),'inativação da rotina audita user_id NULL e nome');
END $$;
SELECT public.verificar(NOT has_function_privilege('authenticated','public.fn_catalogo_dim_renomear_sncf(text,text,text,text[],jsonb,boolean)','EXECUTE') AND NOT has_function_privilege('anon','public.fn_catalogo_dim_renomear_sncf(text,text,text,text[],jsonb,boolean)','EXECUTE') AND has_function_privilege('service_role','public.fn_catalogo_dim_renomear_sncf(text,text,text,text[],jsonb,boolean)','EXECUTE'),'renomeação exclusiva do serviço');
SELECT public.verificar(NOT has_function_privilege('authenticated','public.fn_catalogo_dim_inativar_se_vazio_sncf(text,text,jsonb)','EXECUTE') AND NOT has_function_privilege('anon','public.fn_catalogo_dim_inativar_se_vazio_sncf(text,text,jsonb)','EXECUTE') AND has_function_privilege('service_role','public.fn_catalogo_dim_inativar_se_vazio_sncf(text,text,jsonb)','EXECUTE'),'inativação exclusiva do serviço');