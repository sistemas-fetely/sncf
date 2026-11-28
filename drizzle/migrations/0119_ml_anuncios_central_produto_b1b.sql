SET LOCAL lock_timeout = '3s';
INSERT INTO public.divergencia_sistema_dim (slug, nome, ordem, cor, ativo) VALUES ('Mercado Livre','Mercado Livre',50,'#CA8A04',true) ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.divergencia_regra (slug, nome, sistema, consequencia, o_que_fazer, onde_resolver, ativo, ordem, rota_resolver, campo_matriz, campo_destino, camada) VALUES
 ('ml_preco_diferente','Preço do anúncio difere do varejo','mercado_livre','O cliente do Mercado Livre paga um preço diferente do varejo definido no SNCF.','Ajustar o preço do anúncio no Bling/Mercado Livre para o varejo do SNCF (ou corrigir o varejo no SNCF).','Mercado Livre',true,800,NULL,'detalhe','mlb','cruzamento'),
 ('ml_vinculo_quebrado','Anúncio ML sem produto no SNCF','mercado_livre','O anúncio vende sem casar com um produto do SNCF: estoque, custo e preço não são controlados.','Vincular o produto no Bling ao anúncio (o anúncio está sem produto Bling que case com o SNCF).','Mercado Livre',true,810,NULL,'titulo','mlb','individual')
ON CONFLICT (slug) DO NOTHING;

DO $mig$
DECLARE
  v text := rtrim(pg_get_viewdef('public.vw_conciliacao_fila'::regclass), E' \n;');
  cols text := 'cod_cadastro, sku, nome_comercial, colecao, grupo, fase, slug, j, bling_codigo, xpm_codigo, handle, qtd_divergencias';
  ramos text := $r$), ramo16 AS (
         SELECT a.cod_cadastro, a.sku, a.nome_comercial, p.colecao, p.grupo, p.fase,
            'ml_preco_diferente'::text AS slug,
            jsonb_build_object('detalhe', 'Varejo R$ ' || COALESCE(replace(to_char(a.preco_varejo, 'FM999990.00'), '.', ','), '—') || ' → anúncio R$ ' || COALESCE(replace(to_char(a.preco, 'FM999990.00'), '.', ','), '—')
                || CASE WHEN COALESCE(a.preco_promocional, 0) > 0 THEN ' (promocional R$ ' || replace(to_char(a.preco_promocional, 'FM999990.00'), '.', ',') || ')' ELSE '' END,
              'mlb', a.anuncio_loja_id, 'url_ml', a.url_ml) AS j,
            NULL::text AS bling_codigo, NULL::text AS xpm_codigo, NULL::text AS handle, 1 AS qtd_divergencias
           FROM vw_ml_anuncio_gestao a LEFT JOIN sncf_produtos p ON p.sku = a.sku
          WHERE a.preco_diferente
        ), ramo17 AS (
         SELECT NULL::text AS cod_cadastro, '(sem SKU) ' || COALESCE(a.anuncio_loja_id, a.id::text) AS sku, a.titulo AS nome_comercial,
            NULL::text AS colecao, NULL::text AS grupo, NULL::text AS fase,
            'ml_vinculo_quebrado'::text AS slug,
            jsonb_build_object('titulo', a.titulo, 'mlb', a.anuncio_loja_id, 'url_ml', a.url_ml, 'produto_bling_id', a.produto_bling_id::text) AS j,
            NULL::text AS bling_codigo, NULL::text AS xpm_codigo, NULL::text AS handle, 1 AS qtd_divergencias
           FROM vw_ml_anuncio_gestao a
          WHERE a.recorte = 'vinculo_quebrado'
        ), linhas AS ($r$;
  fim text := E'           FROM ramo9b\n        )\n SELECT md5';
BEGIN
  IF position('ramo16 AS' in v) > 0 THEN RETURN; END IF;
  IF (length(v) - length(replace(v, '), linhas AS (', ''))) <> length('), linhas AS (') THEN RAISE EXCEPTION 'vw_conciliacao_fila: marcador linhas não encontrado uma única vez'; END IF;
  IF position(fim in v) = 0 THEN RAISE EXCEPTION 'vw_conciliacao_fila: marcador final (ramo9b) não encontrado'; END IF;
  v := replace(v, '), linhas AS (', ramos);
  v := replace(v, fim, E'           FROM ramo9b\n        UNION ALL\n         SELECT ' || cols || E' FROM ramo16\n        UNION ALL\n         SELECT ' || cols || E' FROM ramo17\n        )\n SELECT md5');
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_conciliacao_fila WITH (security_invoker = true) AS ' || v;
END
$mig$;

UPDATE public.tarefas_filas SET rota = '/vendas/produto/estoque/destinos?aba=ml&recorte=sem_anuncio' WHERE chave = 'ml_sem_anuncio';
UPDATE public.tarefas_filas SET rota = '/vendas/produto/conciliacao?aba=saida&regra=ml_preco_diferente' WHERE chave = 'ml_preco_diferente';
UPDATE public.tarefas_filas SET rota = '/vendas/produto/conciliacao?aba=saida&regra=ml_vinculo_quebrado' WHERE chave = 'ml_vinculo_quebrado';
UPDATE public.acao_superficie SET rota = '/vendas/produto/estoque/destinos?aba=ml', arquivo = 'AnunciosMl.tsx' WHERE rota = '/vendas/marketplace?aba=anuncios';