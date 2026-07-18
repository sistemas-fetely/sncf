-- 🔵 SNCF
-- ENTREGA 2 MODELO B — Fase 1 (SQL)
-- Peça 1: coluna meio_pagamento em nfs_stage (tPag do XML, hoje descartado)
-- Peça 2: RPC enviar_stage_para_pagamento (duplicatas -> N parcelas CPR)
-- Peça 3: vw_movimentacoes_gerencial com trava por origem (Modelo B puro)

-- ══════════════════════════════════════════════
-- PEÇA 1 — coluna meio_pagamento
-- ══════════════════════════════════════════════
ALTER TABLE public.nfs_stage
    ADD COLUMN IF NOT EXISTS meio_pagamento text;

COMMENT ON COLUMN public.nfs_stage.meio_pagamento IS
    'Forma de pagamento do XML (tPag mapeado): boleto, cartao_credito, cartao_debito, pix, dinheiro, transferencia, outro. Usado pelo guard de enviar_stage_para_pagamento.';

-- ══════════════════════════════════════════════
-- PEÇA 2 — RPC enviar_stage_para_pagamento
-- ══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.enviar_stage_para_pagamento(
    p_stage_id uuid,
    p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_nf RECORD;
    v_dup jsonb;
    v_qtd_dup int;
    v_grupo_id uuid;
    v_cpr_id uuid;
    v_primeira_cpr uuid;
    v_soma_dup numeric := 0;
    v_venc date;
    v_valor numeric;
    v_desc text;
    v_meio_id uuid;
    v_ids uuid[] := '{}';
    i int;
BEGIN
    SELECT * INTO v_nf FROM nfs_stage WHERE id = p_stage_id;

    IF v_nf.id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'NF não encontrada no Stage');
    END IF;

    IF v_nf.conta_pagar_id IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'NF já enviada para pagamento');
    END IF;

    IF v_nf.status = 'descartada' OR v_nf.motivo_descarte IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'NF descartada não gera pagamento');
    END IF;

    IF v_nf.plano_contas_id IS NULL OR v_nf.centro_custo_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Classificação incompleta (plano de contas e centro de custo obrigatórios)');
    END IF;

    IF v_nf.valor IS NULL OR v_nf.valor = 0 THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Valor da NF é zero — não há pagamento real');
    END IF;

    -- Guard cartão: despesa de cartão nasce da fatura (criar_despesa_de_lancamento_v2).
    -- Gerar parcelas aqui dobraria a despesa.
    IF v_nf.meio_pagamento IN ('cartao_credito', 'cartao_debito') THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'NF paga com cartão — a despesa entra pela fatura do cartão, não gere parcelas aqui');
    END IF;

    -- Duplicatas do XML (formato {fat, dup: [{nDup, dVenc, vDup}]})
    v_dup := v_nf.duplicatas -> 'dup';
    v_qtd_dup := COALESCE(jsonb_array_length(v_dup), 0);

    -- Integridade: soma das duplicatas deve bater com o valor da NF
    IF v_qtd_dup > 0 THEN
        SELECT COALESCE(sum((d ->> 'vDup')::numeric), 0)
        INTO v_soma_dup
        FROM jsonb_array_elements(v_dup) AS d;

        IF ABS(v_soma_dup - v_nf.valor) > 0.01 THEN
            RETURN jsonb_build_object(
                'ok', false,
                'motivo', 'Soma das duplicatas (' || v_soma_dup || ') difere do valor da NF (' || v_nf.valor || ') — verificar XML antes de enviar'
            );
        END IF;
    END IF;

    -- Meio de pagamento do CPR (best-effort, por código)
    IF v_nf.meio_pagamento IS NOT NULL THEN
        SELECT id INTO v_meio_id FROM meios_pagamento
        WHERE codigo = v_nf.meio_pagamento LIMIT 1;
    END IF;

    v_desc := COALESCE(
        NULLIF(trim(v_nf.descricao), ''),
        v_nf.fornecedor_razao_social,
        'NF ' || COALESCE(v_nf.nf_numero, '')
    );

    IF v_qtd_dup > 1 THEN
        v_grupo_id := gen_random_uuid();
    END IF;

    IF v_qtd_dup > 0 THEN
        -- N parcelas: vencimento e valor das duplicatas do XML
        FOR i IN 0..(v_qtd_dup - 1) LOOP
            v_venc  := (v_dup -> i ->> 'dVenc')::date;
            v_valor := (v_dup -> i ->> 'vDup')::numeric;

            IF v_venc IS NULL OR v_valor IS NULL OR v_valor = 0 THEN
                RAISE EXCEPTION 'Duplicata % sem vencimento ou valor válido', i + 1;
            END IF;

            INSERT INTO contas_pagar_receber (
                tipo, descricao, valor, data_vencimento,
                competencia, nf_data_emissao, nf_numero, nf_cnpj_emitente,
                fornecedor_cliente, parceiro_id,
                plano_contas_id, centro_custo_id,
                status, origem, meio_pagamento_id,
                parcela_grupo_id, parcela_atual, parcelas,
                categoria_confirmada,
                aprovado_em, aprovado_por, criado_por,
                observacao
            ) VALUES (
                'pagar',
                v_desc || CASE WHEN v_qtd_dup > 1 THEN ' (' || (i + 1) || '/' || v_qtd_dup || ')' ELSE '' END,
                v_valor,
                v_venc,
                date_trunc('month', v_nf.nf_data_emissao)::date,
                v_nf.nf_data_emissao,
                v_nf.nf_numero,
                v_nf.fornecedor_cnpj,
                COALESCE(v_nf.fornecedor_razao_social, v_nf.fornecedor_cliente),
                v_nf.parceiro_id,
                v_nf.plano_contas_id,
                v_nf.centro_custo_id,
                'aprovado',
                'nf_stage',
                v_meio_id,
                v_grupo_id,
                CASE WHEN v_qtd_dup > 1 THEN i + 1 ELSE NULL END,
                CASE WHEN v_qtd_dup > 1 THEN v_qtd_dup ELSE NULL END,
                true,
                now(), p_user_id, p_user_id,
                'Parcela gerada de duplicata do XML (NF Stage ' || p_stage_id || ')'
            ) RETURNING id INTO v_cpr_id;

            v_ids := v_ids || v_cpr_id;
            IF i = 0 THEN
                v_primeira_cpr := v_cpr_id;
            END IF;
        END LOOP;
    ELSE
        -- Sem duplicatas: 1 parcela — vencimento do stage, fallback emissão (sem inventar prazo)
        INSERT INTO contas_pagar_receber (
            tipo, descricao, valor, data_vencimento,
            competencia, nf_data_emissao, nf_numero, nf_cnpj_emitente,
            fornecedor_cliente, parceiro_id,
            plano_contas_id, centro_custo_id,
            status, origem, meio_pagamento_id,
            categoria_confirmada,
            aprovado_em, aprovado_por, criado_por,
            observacao
        ) VALUES (
            'pagar',
            v_desc,
            v_nf.valor,
            COALESCE(v_nf.data_vencimento, v_nf.nf_data_emissao),
            date_trunc('month', v_nf.nf_data_emissao)::date,
            v_nf.nf_data_emissao,
            v_nf.nf_numero,
            v_nf.fornecedor_cnpj,
            COALESCE(v_nf.fornecedor_razao_social, v_nf.fornecedor_cliente),
            v_nf.parceiro_id,
            v_nf.plano_contas_id,
            v_nf.centro_custo_id,
            'aprovado',
            'nf_stage',
            v_meio_id,
            true,
            now(), p_user_id, p_user_id,
            'Pagamento gerado da NF Stage ' || p_stage_id || ' (sem duplicatas no XML)'
        ) RETURNING id INTO v_primeira_cpr;

        v_ids := v_ids || v_primeira_cpr;
    END IF;

    -- Vincula o stage (pill Vinculadas conta por conta_pagar_id)
    UPDATE nfs_stage
    SET conta_pagar_id = v_primeira_cpr,
        updated_at = now()
    WHERE id = p_stage_id;

    RETURN jsonb_build_object(
        'ok', true,
        'qtd_parcelas', COALESCE(array_length(v_ids, 1), 0),
        'conta_pagar_ids', to_jsonb(v_ids),
        'parcela_grupo_id', v_grupo_id
    );
END;
$function$;

-- ══════════════════════════════════════════════
-- PEÇA 3 — view gerencial com trava por origem
-- (Modelo B puro: CPR origem 'nf_stage' é só caixa, nunca competência)
-- ══════════════════════════════════════════════
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
  AND cpr.origem IS DISTINCT FROM 'nf_stage'  -- Modelo B: parcelas de NF Stage são só caixa
  AND NOT EXISTS (
      SELECT 1 FROM nfs_stage s2 WHERE s2.conta_pagar_id = cpr.id
  );
