CREATE OR REPLACE VIEW public.vw_xpm_cad_item WITH (security_invoker = true) AS
 SELECT COALESCE(ip.rocabella_ref, ip.numero_pedido) AS pedido_ref,
    ip.numero_pedido,
    il.sku AS codigo_material,
    COALESCE(NULLIF(btrim(il.grupo_produto), ''::text), s.grupo) AS categoria,
    COALESCE(s.nome_operacional, s.nome_completo, s.nome_comercial, NULLIF(btrim(il.descricao_original), ''::text), s.descricao_produto) AS descricao,
    COALESCE(s.nome_operacional, s.nome_comercial, s.nome_completo, NULLIF(btrim(il.descricao_original), ''::text)) AS descricao_reduzida,
    'Unidade'::text AS unid_med,
    round((COALESCE(s.peso_g, (0)::numeric) / 1000.0), 3) AS peso_liquido,
    COALESCE(s.ean, il.ean) AS codigo_barras,
    COALESCE(novo.nf_numero, nfl.nf_numero,
        CASE
            WHEN (ip.modalidade = 'nacional'::text) THEN ip.referencia_fornecedor
            ELSE NULL::text
        END) AS nf,
    COALESCE(novo.codigo_nf, ca.codigo_nf) AS cod_nf,
    COALESCE(s.ncm, novo.ncm, ca.ncm, nfl.ncm) AS ncm,
    COALESCE(al.qtd_alocada, (il.qtd_kits)::numeric) AS qtd_item_sku,
    (il.qtd_kits)::numeric AS qtd_pedida,
    al.qtd_alocada,
        CASE
            WHEN (al.qtd_alocada IS NULL) THEN NULL::numeric
            ELSE ((il.qtd_kits)::numeric - al.qtd_alocada)
        END AS corte_vs_pedido,
    s.tipo_embalagem AS descricao_embalagem,
    s.altura_cm,
    s.largura_cm,
    NULL::integer AS camada,
    NULL::integer AS lastro,
    fn_gtin14(COALESCE(s.ean, il.ean)) AS cod_caixa,
    il.total_caixas_master AS qtd_caixas_master,
    il.total_caixas_inner AS qtd_caixas_inner,
    round((COALESCE(s.peso_g, (0)::numeric) / 1000.0), 3) AS peso_sku,
    round((s.altura_cm / 100.0), 4) AS altura_m,
    round((s.largura_cm / 100.0), 4) AS largura_m,
    round((s.profundidade_cm / 100.0), 4) AS comprimento_m,
    ip.numero_pedido AS lote,
        CASE
            WHEN ((novo.codigo_nf IS NOT NULL) OR (ca.codigo_nf IS NOT NULL) OR COALESCE(st.exige_nf, false)) THEN 2
            ELSE 1
        END AS fase,
    pnf.tem_nf AS pedido_tem_nf,
    (pnf.tem_nf AND (al.qtd_alocada IS NULL)) AS declarado_incompleto,
    ((al.qtd_alocada IS NOT NULL) AND (al.qtd_alocada < (il.qtd_kits)::numeric)) AS alocacao_parcial,
    CASE WHEN al.qtd_alocada IS NOT NULL THEN CASE WHEN al.n_precos > 1 THEN round(al.soma_rateado / NULLIF(al.qtd_alocada, 0::numeric), 4) ELSE al.preco_unico END ELSE nfl.valor_unit END AS valor_unit_nf,
    COALESCE(al.n_precos > 1, false) AS valor_unit_nf_misto
   FROM ((((((((importacao_linha il
     JOIN importacao_pedido ip ON ((ip.id = il.importacao_pedido_id)))
     LEFT JOIN importacao_status st ON ((st.id = ip.status_id)))
     LEFT JOIN sncf_produtos s ON ((s.sku = il.sku)))
     LEFT JOIN custo_aterrissagem ca ON ((ca.sku = il.sku)))
     CROSS JOIN LATERAL ( SELECT (EXISTS ( SELECT 1
                   FROM importacao_nf_pedido q
                  WHERE (q.importacao_pedido_id = ip.id))) AS tem_nf) pnf)
     LEFT JOIN LATERAL ( SELECT sum(a.quantidade) AS qtd_alocada, sum(a.valor_rateado) AS soma_rateado, count(DISTINCT nl.valor_unit) AS n_precos, min(nl.valor_unit) AS preco_unico
           FROM ((importacao_nf_linha_sku a
             JOIN importacao_nf_linha nl ON ((nl.id = a.nf_linha_id)))
             JOIN importacao_nf_pedido np ON (((np.nf_id = nl.nf_id) AND (np.importacao_pedido_id = ip.id))))
          WHERE ((a.sku = il.sku) AND ((a.importacao_pedido_id IS NULL) OR (a.importacao_pedido_id = ip.id)))) al ON (true))
     LEFT JOIN LATERAL ( SELECT nf.numero AS nf_numero,
            nl.codigo_nf,
            nl.ncm
           FROM (((importacao_nf_linha_sku a
             JOIN importacao_nf_linha nl ON ((nl.id = a.nf_linha_id)))
             JOIN importacao_nf nf ON ((nf.id = nl.nf_id)))
             JOIN importacao_nf_pedido np ON (((np.nf_id = nf.id) AND (np.importacao_pedido_id = ip.id))))
          WHERE ((a.sku = il.sku) AND ((a.importacao_pedido_id IS NULL) OR (a.importacao_pedido_id = ip.id)))
          ORDER BY nl.item_seq
         LIMIT 1) novo ON (true))
     LEFT JOIN LATERAL ( SELECT n.nf_numero,
            n.ncm,
            n.valor_unit
           FROM importacao_nf_linha n
          WHERE ((n.codigo_nf = ca.codigo_nf) AND (n.rocabella_ref = ip.rocabella_ref))
         LIMIT 1) nfl ON (true));