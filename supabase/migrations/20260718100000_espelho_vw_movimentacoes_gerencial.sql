-- 🔵 SNCF
-- Espelho: vw_movimentacoes_gerencial (Modelo B — UNION nfs_stage + contas_pagar_receber)
-- Extraído do banco vivo em 18/07/2026 via pg_get_viewdef
-- Destino: supabase/migrations/ via GitHub web

DROP VIEW IF EXISTS public.vw_movimentacoes_gerencial;

CREATE VIEW public.vw_movimentacoes_gerencial
WITH (security_invoker = true)
AS
SELECT s.id,
    'pagar'::text AS tipo,
    COALESCE(
        date_trunc('month', s.nf_data_emissao::timestamp with time zone)::date,
        date_trunc('month', s.created_at)::date
    ) AS competencia,
    COALESCE(s.descricao, s.fornecedor_razao_social, 'NF ' || COALESCE(s.nf_numero, '')) AS descricao,
    COALESCE(s.fornecedor_razao_social, s.fornecedor_cliente) AS fornecedor_cliente,
    s.parceiro_id,
    COALESCE(s.valor, 0::numeric) AS valor,
    s.status,
    s.data_vencimento,
    NULL::date AS data_pagamento,
    s.plano_contas_id,
    pc.nome AS plano_contas_nome,
    s.centro_custo_id,
    cc.nome AS centro_custo_nome,
    s.nf_numero,
    (s.plano_contas_id IS NOT NULL) AS categoria_confirmada,
    (s.plano_contas_id IS NOT NULL AND s.centro_custo_id IS NOT NULL) AS classificacao_completa
FROM nfs_stage s
LEFT JOIN plano_contas pc ON pc.id = s.plano_contas_id
LEFT JOIN centros_custo cc ON cc.id = s.centro_custo_id
WHERE s.status <> 'descartada'
  AND s.motivo_descarte IS NULL

UNION ALL

SELECT cpr.id,
    cpr.tipo,
    COALESCE(
        cpr.competencia,
        date_trunc('month', cpr.nf_data_emissao::timestamp with time zone)::date,
        date_trunc('month', cpr.data_compra::timestamp with time zone)::date,
        date_trunc('month', cpr.data_vencimento::timestamp with time zone)::date
    ) AS competencia,
    cpr.descricao,
    cpr.fornecedor_cliente,
    cpr.parceiro_id,
    cpr.valor,
    cpr.status,
    cpr.data_vencimento,
    cpr.data_pagamento,
    cpr.plano_contas_id,
    pc.nome AS plano_contas_nome,
    cpr.centro_custo_id,
    cc.nome AS centro_custo_nome,
    cpr.nf_numero,
    cpr.categoria_confirmada,
    (cpr.plano_contas_id IS NOT NULL AND cpr.centro_custo_id IS NOT NULL) AS classificacao_completa
FROM contas_pagar_receber cpr
LEFT JOIN plano_contas pc ON pc.id = cpr.plano_contas_id
LEFT JOIN centros_custo cc ON cc.id = cpr.centro_custo_id
WHERE cpr.status <> 'cancelado'
  AND cpr.deleted_at IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM nfs_stage s2 WHERE s2.conta_pagar_id = cpr.id
  );
