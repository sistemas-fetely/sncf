-- 🔵 SNCF
-- Espelho: vw_nfs_stage_completude (com revisada_em, revisada_por, duplicatas)
-- Extraído do banco vivo em 18/07/2026 via pg_get_viewdef
-- Destino: supabase/migrations/ via GitHub web

DROP VIEW IF EXISTS public.vw_nfs_stage_completude;

CREATE VIEW public.vw_nfs_stage_completude
WITH (security_invoker = true)
AS
SELECT
    ns.id,
    ns.fonte,
    ns.importacao_lote_id,
    ns.fornecedor_cnpj,
    ns.fornecedor_razao_social,
    ns.fornecedor_cliente,
    ns.parceiro_id,
    ns.nf_numero,
    ns.nf_chave_acesso,
    ns.nf_data_emissao,
    ns.nf_serie,
    ns.valor,
    ns.descricao,
    ns.plano_contas_id AS categoria_id,  -- legado — manter para compatibilidade
    ns.plano_contas_id,
    ns.centro_custo_id,
    ns.data_vencimento,
    ns.itens,
    ns.status,
    ns.match_score,
    ns.match_motivos,
    ns.conta_pagar_id,
    ns.motivo_descarte,
    ns.criada_por,
    ns.created_at,
    ns.updated_at,
    ns.tipo_documento,
    ns.pais_emissor,
    ns.moeda,
    ns.valor_origem,
    ns.taxa_conversao,
    ns.tem_xml_obrigatorio,
    ns.resumo_pdf_pendente,
    ns.resumo_pdf_gerado_em,
    ns.resumo_pdf_storage_path,
    ns.numero_parcela,
    ns.total_parcelas,
    ns.numero_documento_referencia,
    ns.revisada_em,
    ns.revisada_por,
    ns.duplicatas,
    COALESCE(bool_or(d.tipo = 'pdf_danfe'), false) AS tem_pdf,
    COALESCE(bool_or(d.tipo = 'xml'), false) AS tem_xml,
    COALESCE(bool_or(d.tipo = 'pdf_boleto'), false) AS tem_boleto,
    count(d.id) FILTER (WHERE d.tipo = 'pdf_boleto') AS qtd_boletos,
    sum(d.valor) FILTER (WHERE d.tipo = 'pdf_boleto') AS soma_boletos,
    COALESCE(
        NULLIF(ns.valor, 0),
        sum(d.valor) FILTER (WHERE d.tipo = 'pdf_boleto')
    ) AS valor_exibido,
    COALESCE(
        json_agg(
            json_build_object(
                'id', d.id,
                'tipo', d.tipo,
                'arquivo_nome', d.arquivo_nome,
                'storage_path', d.storage_path,
                'linha_digitavel', d.linha_digitavel,
                'valor', d.valor,
                'data_vencimento', d.data_vencimento,
                'criado_em', d.criado_em
            ) ORDER BY d.criado_em
        ) FILTER (WHERE d.id IS NOT NULL),
        '[]'::json
    ) AS documentos,
    CASE
        WHEN ns.tipo_documento = 'recibo' AND bool_or(d.tipo = 'pdf_danfe') THEN 'completo'
        WHEN ns.tipo_documento = 'recibo' THEN 'sem_pdf'
        WHEN ns.tipo_documento = 'nfse' AND bool_or(d.tipo = 'xml') THEN 'completo'
        WHEN ns.tipo_documento = 'nfse' THEN 'sem_xml'
        WHEN ns.tem_xml_obrigatorio = false AND bool_or(d.tipo = 'pdf_danfe') THEN 'completo'
        WHEN ns.tem_xml_obrigatorio = false THEN 'sem_pdf'
        WHEN bool_or(d.tipo = 'pdf_danfe') AND bool_or(d.tipo = 'xml') THEN 'completo'
        WHEN bool_or(d.tipo = 'pdf_danfe') THEN 'sem_xml'
        WHEN bool_or(d.tipo = 'xml') THEN 'sem_pdf'
        ELSE 'sem_documentos'
    END AS completude,
    ns.categoria_sugerida_ia
FROM nfs_stage ns
LEFT JOIN nfs_stage_documentos d ON d.nfs_stage_id = ns.id
GROUP BY ns.id;
