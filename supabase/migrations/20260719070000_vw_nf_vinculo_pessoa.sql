-- 🔵 SNCF
-- Espelho: vw_nf_vinculo_pessoa — lente NF<->Pessoa por CNPJ (leitura pura)
-- Aplicado no banco vivo em 19/07/2026.
-- ═══ 1. A LENTE: para cada NF de PJ, de qual pessoa/vinculo ela e ═══
DROP VIEW IF EXISTS public.vw_nf_vinculo_pessoa;
CREATE VIEW public.vw_nf_vinculo_pessoa
WITH (security_invoker = true)
AS
SELECT
    ns.id                              AS stage_id,
    ns.fornecedor_cnpj,
    ns.fornecedor_razao_social,
    ns.nf_numero,
    ns.nf_data_emissao,
    ns.valor,
    ns.plano_contas_id,
    ns.revisada_em,
    p.id                               AS pessoa_id,
    p.nome_completo                    AS pessoa_nome,
    v.id                               AS vinculo_id,
    v.tipo_vinculo,
    v.status                           AS vinculo_status,
    (v.id IS NOT NULL)                 AS tem_vinculo_pessoa
FROM nfs_stage ns
LEFT JOIN vinculos v
       ON regexp_replace(COALESCE(v.cnpj,''), '\D', '', 'g') = regexp_replace(COALESCE(ns.fornecedor_cnpj,''), '\D', '', 'g')
      AND length(regexp_replace(COALESCE(v.cnpj,''), '\D', '', 'g')) >= 8
LEFT JOIN pessoas p ON p.id = v.pessoa_id
WHERE ns.motivo_descarte IS NULL
  AND ns.status NOT IN ('descartada','duplicata');

-- ═══ 2. DIAGNOSTICO: o balde "pessoa fisica" e captura ou estrutural? (rode separado) ═══
-- (deixado como comentario para nao misturar DDL com SELECT no mesmo arquivo executavel;
--  o SELECT vai no arquivo de diagnostico ao lado.)
