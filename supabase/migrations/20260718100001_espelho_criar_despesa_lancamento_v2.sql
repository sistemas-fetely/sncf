-- 🔵 SNCF
-- Espelho: criar_despesa_de_lancamento_v2 (internalizada — v1 não existe)
-- Extraído do banco vivo em 18/07/2026 via pg_get_functiondef
-- Destino: supabase/migrations/ via GitHub web

CREATE OR REPLACE FUNCTION public.criar_despesa_de_lancamento_v2(
    p_lancamento_id uuid,
    p_total_parcelas integer DEFAULT 1,
    p_gerar_todas boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_lanc RECORD;
    v_conta_orfa RECORD;
    v_desc_base text;
    v_fatura RECORD;
    v_user_id uuid;
    v_forma_pgto_id uuid;
    v_meio_pgto_id uuid;
    v_data_venc_base date;
    v_grupo_id uuid;
    v_parcela_inicial int;
    v_conta_id uuid;
    v_conta_do_lancamento uuid;
    v_qtd int := 0;
    i int;
BEGIN
    SELECT * INTO v_lanc FROM fatura_cartao_lancamentos WHERE id = p_lancamento_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Lançamento não encontrado');
    END IF;

    IF v_lanc.conta_pagar_id IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Lançamento já vinculado a uma conta');
    END IF;

    IF v_lanc.valor IS NULL OR v_lanc.valor = 0 THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Valor do lançamento é zero — não há despesa real');
    END IF;

    -- Normaliza descrição base removendo TODOS os padrões de parcela
    v_desc_base := TRIM(REGEXP_REPLACE(
        REGEXP_REPLACE(
            COALESCE(v_lanc.descricao, ''),
            '[\(\[]\s*\d+\s*[/\-]\s*\d+\s*[\)\]]', ' ', 'g'
        ),
        '\d+\s*[/\-]\s*\d+', ' ', 'g'
    ));
    v_desc_base := REGEXP_REPLACE(v_desc_base, '\s+', ' ', 'g');
    v_desc_base := TRIM(v_desc_base);

    -- ====================================================
    -- RECONCILIAÇÃO: parcela 2+ procura conta órfã do grupo
    -- ====================================================
    IF v_lanc.parcela_atual IS NOT NULL AND v_lanc.parcela_atual > 1 THEN
        SELECT cpr.* INTO v_conta_orfa
        FROM contas_pagar_receber cpr
        WHERE cpr.parcela_grupo_id IS NOT NULL
          AND ABS(cpr.valor - v_lanc.valor) <= 0.01
          AND cpr.deleted_at IS NULL
          AND cpr.status NOT IN ('cancelado', 'paga')
          AND NOT EXISTS (
              SELECT 1 FROM fatura_cartao_lancamentos fcl2
              WHERE fcl2.conta_pagar_id = cpr.id
          )
          AND (
              (v_lanc.parceiro_id IS NOT NULL AND cpr.parceiro_id = v_lanc.parceiro_id)
              OR (v_lanc.cnpj_estabelecimento IS NOT NULL AND cpr.nf_cnpj_emitente = v_lanc.cnpj_estabelecimento)
              OR TRIM(REGEXP_REPLACE(
                  REGEXP_REPLACE(
                      COALESCE(cpr.descricao, ''),
                      '[\(\[]\s*\d+\s*[/\-]\s*\d+\s*[\)\]]', ' ', 'g'
                  ),
                  '\d+\s*[/\-]\s*\d+', ' ', 'g'
              )) ILIKE '%' || v_desc_base || '%'
          )
        ORDER BY cpr.data_vencimento ASC, cpr.created_at ASC
        LIMIT 1;

        IF v_conta_orfa.id IS NOT NULL THEN
            UPDATE fatura_cartao_lancamentos
            SET conta_pagar_id = v_conta_orfa.id,
                status = 'virou_despesa',
                updated_at = now()
            WHERE id = p_lancamento_id;

            RETURN jsonb_build_object(
                'ok', true,
                'vinculou_existente', true,
                'conta_id', v_conta_orfa.id,
                'descricao', v_conta_orfa.descricao,
                'valor', v_conta_orfa.valor,
                'qtd_contas_criadas', 0,
                'mensagem', 'Vinculado à parcela existente do grupo (vencimento ' ||
                    to_char(v_conta_orfa.data_vencimento, 'DD/MM/YYYY') || ')'
            );
        END IF;
    END IF;

    -- ====================================================
    -- CRIAÇÃO (internalizada — antes delegava à v1 inexistente)
    -- ====================================================
    SELECT * INTO v_fatura FROM faturas_cartao WHERE id = v_lanc.fatura_id;
    v_user_id := auth.uid();
    v_data_venc_base := COALESCE(v_fatura.data_vencimento, v_lanc.data_compra);

    SELECT id INTO v_forma_pgto_id FROM formas_pagamento
    WHERE LOWER(nome) ~ '(cart.{0,3}o.*cr.{0,4}dit|crédit)' LIMIT 1;

    SELECT id INTO v_meio_pgto_id FROM meios_pagamento
    WHERE codigo = 'fatura_cartao' LIMIT 1;

    IF p_gerar_todas AND COALESCE(p_total_parcelas, 1) > 1 THEN
        v_grupo_id := gen_random_uuid();
        v_parcela_inicial := COALESCE(v_lanc.parcela_atual, 1);

        FOR i IN v_parcela_inicial..p_total_parcelas LOOP
            INSERT INTO contas_pagar_receber (
                tipo, descricao, valor, data_vencimento, data_compra, nf_data_emissao,
                fornecedor_cliente, parceiro_id, fornecedor_id, plano_contas_id, centro_custo_id,
                status, origem, meio_pagamento_id, forma_pagamento_id,
                parcela_grupo_id, parcela_atual, parcelas,
                aprovado_em, aprovado_por, observacao, criado_por
            ) VALUES (
                'pagar',
                v_desc_base || ' (' || i || '/' || p_total_parcelas || ')',
                v_lanc.valor,
                (v_data_venc_base + make_interval(months => i - v_parcela_inicial))::date,
                v_lanc.data_compra,
                v_lanc.data_compra,
                (SELECT razao_social FROM parceiros_comerciais WHERE id = v_lanc.parceiro_id),
                v_lanc.parceiro_id,
                v_lanc.parceiro_id,
                v_lanc.plano_contas_id,
                v_lanc.centro_custo_id,
                'aprovado', 'cartao',
                v_meio_pgto_id, v_forma_pgto_id,
                v_grupo_id, i, p_total_parcelas,
                now(), v_user_id,
                'Despesa de lançamento do cartão (parcela ' || i || '/' || p_total_parcelas || '): ' ||
                    COALESCE(v_lanc.descricao, ''),
                v_user_id
            ) RETURNING id INTO v_conta_id;

            v_qtd := v_qtd + 1;
            IF i = v_parcela_inicial THEN
                v_conta_do_lancamento := v_conta_id;
            END IF;
        END LOOP;
    ELSE
        INSERT INTO contas_pagar_receber (
            tipo, descricao, valor, data_vencimento, data_compra, nf_data_emissao,
            fornecedor_cliente, parceiro_id, fornecedor_id, plano_contas_id, centro_custo_id,
            status, origem, meio_pagamento_id, forma_pagamento_id,
            aprovado_em, aprovado_por, observacao, criado_por
        ) VALUES (
            'pagar',
            v_lanc.descricao,
            v_lanc.valor,
            v_data_venc_base,
            v_lanc.data_compra,
            v_lanc.data_compra,
            (SELECT razao_social FROM parceiros_comerciais WHERE id = v_lanc.parceiro_id),
            v_lanc.parceiro_id,
            v_lanc.parceiro_id,
            v_lanc.plano_contas_id,
            v_lanc.centro_custo_id,
            'aprovado', 'cartao',
            v_meio_pgto_id, v_forma_pgto_id,
            now(), v_user_id,
            'Despesa de lançamento do cartão: ' || COALESCE(v_lanc.descricao, ''),
            v_user_id
        ) RETURNING id INTO v_conta_do_lancamento;
        v_qtd := 1;
    END IF;

    UPDATE fatura_cartao_lancamentos
    SET conta_pagar_id = v_conta_do_lancamento,
        status = 'virou_despesa',
        updated_at = now()
    WHERE id = p_lancamento_id;

    RETURN jsonb_build_object(
        'ok', true,
        'vinculou_existente', false,
        'conta_id', v_conta_do_lancamento,
        'qtd_contas_criadas', v_qtd,
        'descricao', v_lanc.descricao,
        'valor', v_lanc.valor
    );
END;
$function$;
