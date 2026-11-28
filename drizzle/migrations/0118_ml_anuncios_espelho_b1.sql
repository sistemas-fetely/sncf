SET LOCAL lock_timeout = '3s';

CREATE TABLE public.bling_anuncio_situacao_dim (
  codigo int PRIMARY KEY, rotulo text NOT NULL, cor text NOT NULL DEFAULT 'muted', ativo boolean NOT NULL DEFAULT true, observacao text);
GRANT SELECT ON public.bling_anuncio_situacao_dim TO authenticated;
GRANT ALL ON public.bling_anuncio_situacao_dim TO service_role;
ALTER TABLE public.bling_anuncio_situacao_dim ENABLE ROW LEVEL SECURITY;
CREATE POLICY bling_anuncio_situacao_dim_leitura ON public.bling_anuncio_situacao_dim FOR SELECT TO authenticated USING (true);
INSERT INTO public.bling_anuncio_situacao_dim (codigo, rotulo, cor, observacao) VALUES
 (1,'Ativo','success','rótulo provisório, confirmar por amostra'),
 (2,'Em revisão','info','rótulo provisório, confirmar por amostra'),
 (3,'Pausado','warning','rótulo provisório, confirmar por amostra'),
 (4,'Encerrado','muted','rótulo provisório, confirmar por amostra'),
 (5,'Inativo','muted','rótulo provisório, confirmar por amostra');

CREATE TABLE public.bling_anuncio (
  id bigint PRIMARY KEY, loja_bling_id bigint NOT NULL, marketplace_codigo text NOT NULL DEFAULT 'ML',
  anuncio_loja_id text, titulo text, descricao text, situacao int, status int,
  preco numeric, preco_promocional numeric, produto_bling_id bigint, sku text, cod_cadastro text,
  qtd_imagens int, qtd_atributos int, qtd_variacoes int, atributos jsonb, imagens jsonb, variacoes jsonb, payload jsonb,
  visto_em timestamptz NOT NULL DEFAULT now(), sumiu_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(), atualizado_em timestamptz NOT NULL DEFAULT now());
CREATE INDEX ix_bling_anuncio_loja_id ON public.bling_anuncio (anuncio_loja_id);
CREATE INDEX ix_bling_anuncio_sku ON public.bling_anuncio (sku);
CREATE INDEX ix_bling_anuncio_situacao ON public.bling_anuncio (situacao);
CREATE INDEX ix_bling_anuncio_produto ON public.bling_anuncio (produto_bling_id);
GRANT SELECT ON public.bling_anuncio TO authenticated;
GRANT ALL ON public.bling_anuncio TO service_role;
ALTER TABLE public.bling_anuncio ENABLE ROW LEVEL SECURITY;
CREATE POLICY bling_anuncio_leitura ON public.bling_anuncio FOR SELECT TO authenticated USING (true);

CREATE TABLE public.bling_anuncio_sync_execucao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), iniciado_em timestamptz NOT NULL DEFAULT now(), terminado_em timestamptz,
  loja_bling_id bigint, total_lidos int NOT NULL DEFAULT 0, total_novos int NOT NULL DEFAULT 0,
  total_alterados int NOT NULL DEFAULT 0, total_sumidos int NOT NULL DEFAULT 0, erro text, detalhes jsonb);
CREATE INDEX ix_bling_anuncio_sync_exec_inicio ON public.bling_anuncio_sync_execucao (iniciado_em DESC);
GRANT SELECT ON public.bling_anuncio_sync_execucao TO authenticated;
GRANT ALL ON public.bling_anuncio_sync_execucao TO service_role;
ALTER TABLE public.bling_anuncio_sync_execucao ENABLE ROW LEVEL SECURITY;
CREATE POLICY bling_anuncio_sync_execucao_leitura ON public.bling_anuncio_sync_execucao FOR SELECT TO authenticated USING (true);

CREATE VIEW public.vw_ml_anuncio_gestao WITH (security_invoker = true) AS
SELECT a.id, a.loja_bling_id, a.titulo, a.anuncio_loja_id, a.situacao, d.rotulo AS situacao_rotulo, d.cor AS situacao_cor,
  a.preco, a.preco_promocional, a.sku, a.cod_cadastro, p.nome_comercial, p.preco_varejo,
  CASE WHEN p.preco_varejo IS NOT NULL THEN a.preco - p.preco_varejo END AS diferenca_preco,
  CASE WHEN a.anuncio_loja_id ~* '^MLB\d+$' THEN 'https://produto.mercadolivre.com.br/MLB-' || substr(a.anuncio_loja_id, 4) END AS url_ml,
  CASE WHEN a.sku IS NULL THEN 'vinculo_quebrado' WHEN a.situacao IN (3,5) THEN 'pausado' WHEN a.situacao = 1 THEN 'anunciado'
       WHEN a.situacao = 4 THEN 'encerrado' WHEN a.situacao = 2 THEN 'revisao' ELSE 'outro' END AS recorte,
  (a.sku IS NOT NULL AND p.preco_varejo IS NOT NULL AND abs(a.preco - p.preco_varejo) >= 0.01) AS preco_diferente,
  a.qtd_imagens, a.qtd_atributos, a.qtd_variacoes, a.produto_bling_id, a.visto_em
FROM public.bling_anuncio a
LEFT JOIN public.bling_anuncio_situacao_dim d ON d.codigo = a.situacao
LEFT JOIN LATERAL (SELECT s.nome_comercial, s.preco_varejo FROM public.sncf_produtos s WHERE s.sku = a.sku ORDER BY s.ativo DESC LIMIT 1) p ON true
WHERE a.sumiu_em IS NULL;
GRANT SELECT ON public.vw_ml_anuncio_gestao TO authenticated, service_role;

CREATE VIEW public.vw_ml_sem_anuncio WITH (security_invoker = true) AS
SELECT s.sku AS id, s.sku, s.cod_cadastro, s.nome_comercial, s.preco_varejo, true AS exige_acao_nossa, s.atualizado_em AS desde
FROM public.sncf_produtos s
WHERE s.ativo AND s.canal_venda IN ('B2C','ambos') AND s.sku IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.bling_anuncio a WHERE a.sumiu_em IS NULL AND a.sku = s.sku);
GRANT SELECT ON public.vw_ml_sem_anuncio TO authenticated, service_role;

CREATE VIEW public.vw_fila_ml_sem_anuncio WITH (security_invoker = true) AS
SELECT * FROM public.vw_ml_sem_anuncio ORDER BY desde;
CREATE VIEW public.vw_fila_ml_preco_diferente WITH (security_invoker = true) AS
SELECT id, sku, cod_cadastro, nome_comercial, titulo, anuncio_loja_id, url_ml, preco, preco_varejo, diferenca_preco, visto_em, true AS exige_acao_nossa
FROM public.vw_ml_anuncio_gestao WHERE preco_diferente ORDER BY abs(diferenca_preco) DESC;
CREATE VIEW public.vw_fila_ml_vinculo_quebrado WITH (security_invoker = true) AS
SELECT id, titulo, anuncio_loja_id, url_ml, produto_bling_id, preco, situacao_rotulo, visto_em, true AS exige_acao_nossa
FROM public.vw_ml_anuncio_gestao WHERE recorte = 'vinculo_quebrado' ORDER BY visto_em;
GRANT SELECT ON public.vw_fila_ml_sem_anuncio, public.vw_fila_ml_preco_diferente, public.vw_fila_ml_vinculo_quebrado TO authenticated, service_role;

INSERT INTO public.tarefas_filas (chave, nome, descricao, departamento_id, fonte_contagem, fonte_tipo, estado, rota, severidade, ordem, coluna_acao_nossa, coluna_entrada, exec_coluna_id) VALUES
 ('ml_sem_anuncio','ML — produto sem anúncio','Produto ativo de venda B2C sem anúncio vivo no Mercado Livre (espelho do Bling).','aab9d00d-03e1-46bc-ac6c-509e4a168535','vw_fila_ml_sem_anuncio','view','pronta','/vendas/marketplace?aba=anuncios&recorte=sem_anuncio','normal',49,'exige_acao_nossa','desde','id'),
 ('ml_preco_diferente','ML — preço do anúncio diferente do varejo','Anúncio do Mercado Livre com preço diferente do preço de varejo do SNCF.','aab9d00d-03e1-46bc-ac6c-509e4a168535','vw_fila_ml_preco_diferente','view','pronta','/vendas/marketplace?aba=anuncios&recorte=preco_diferente','alta',50,'exige_acao_nossa','visto_em','id'),
 ('ml_vinculo_quebrado','ML — anúncio sem produto no SNCF','Anúncio do Mercado Livre cujo produto Bling não casa com nenhum produto do SNCF.','aab9d00d-03e1-46bc-ac6c-509e4a168535','vw_fila_ml_vinculo_quebrado','view','pronta','/vendas/marketplace?aba=anuncios&recorte=vinculo_quebrado','alta',51,'exige_acao_nossa','visto_em','id');

INSERT INTO public.permissoes_catalogo (slug, tipo, pilar, nome_exibicao, descricao, categoria_sod)
VALUES ('acao.marketplace.sincronizar','acao','vendas','Ler anúncios do marketplace agora','Dispara a leitura dos anúncios do Mercado Livre no Bling (edge bling-anuncios-sync).','execucao');
INSERT INTO public.grupo_acesso_permissoes (grupo_acesso_id, permissao_id, pode_ver)
SELECT g.id, pc.id, true FROM public.permissoes_catalogo pc
CROSS JOIN (VALUES ('28655c47-ce63-48da-9257-f96978ea0a02'::uuid), ('36f88823-0d80-4a6d-abc2-537b31271dbc'::uuid)) g(id)
WHERE pc.slug = 'acao.marketplace.sincronizar';
INSERT INTO public.acao_superficie (rota, arquivo, rotulo, dispara, guarda_atual, risco, permissao_id, origem)
SELECT '/vendas/marketplace?aba=anuncios','AnunciosMl.tsx','Ler agora (anúncios ML)','edge bling-anuncios-sync','acao.marketplace.sincronizar','BAIXO', id, 'frente_plano_b_ml_b1_2026-11-28'
FROM public.permissoes_catalogo WHERE slug='acao.marketplace.sincronizar';