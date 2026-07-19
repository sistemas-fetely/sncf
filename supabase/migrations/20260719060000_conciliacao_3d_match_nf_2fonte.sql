-- 🔵 SNCF
-- Espelho: Conciliacao Fatia 3-D peca 4 — 2a fonte (debito x NF revisada) + RPC conciliar_debito_com_nf + furos v2
-- Aplicado no banco vivo em 19/07/2026. Fecha o elo NF->CPR->banco retroativo.

-- ═══ 1. Sugestoes: debito sem destino x NF revisada sem CPR ═══
-- Score: CNPJ do fornecedor nos digitos do debito = 3 (Itau SISPAG tem CNPJ);
--        valor exato ±1 centavo = 2, ±1%% = 1 (PIX Safra casa por aqui);
--        data do debito entre emissao e emissao+60d = 1. Sugere score >= 3.

-- Ordem de dependencia: furos depende das views de sugestao. Derruba a dependente
-- primeiro para permitir recriar as sugestoes (idempotente em re-execucao).
DROP VIEW IF EXISTS public.vw_conciliacao_furos;
DROP VIEW IF EXISTS public.vw_despesas_match_nf_sugestoes;
CREATE VIEW public.vw_despesas_match_nf_sugestoes
WITH (security_invoker = true)
AS
WITH debitos_abertos AS (
    SELECT mb.id, mb.data_transacao, mb.descricao, abs(mb.valor) AS valor_abs,
           regexp_replace(COALESCE(mb.contraparte_documento,'') || ' ' || COALESCE(mb.descricao,''), '\D', '', 'g') AS digitos
    FROM movimentacoes_bancarias mb
    WHERE mb.tipo = 'debito'
      AND mb.classe IS NULL
      AND COALESCE(mb.conciliado, false) = false
      AND mb.par_transferencia_id IS NULL
      AND mb.conta_pagar_id IS NULL
),
candidatos AS (
    SELECT d.id AS mov_id, d.data_transacao, d.descricao AS mov_descricao, d.valor_abs,
           ns.id AS stage_id, ns.fornecedor_razao_social, ns.fornecedor_cnpj,
           ns.nf_numero, ns.nf_data_emissao, ns.valor AS nf_valor,
           (CASE WHEN ns.fornecedor_cnpj IS NOT NULL
                  AND length(ns.fornecedor_cnpj) >= 8
                  AND position(ns.fornecedor_cnpj IN d.digitos) > 0
             THEN 3 ELSE 0 END)
         + (CASE WHEN abs(COALESCE(ns.valor,0) - d.valor_abs) < 0.01 THEN 2
                 WHEN COALESCE(ns.valor,0) > 0
                  AND abs(COALESCE(ns.valor,0) - d.valor_abs) / ns.valor <= 0.01 THEN 1
                 ELSE 0 END)
         + (CASE WHEN d.data_transacao BETWEEN ns.nf_data_emissao AND ns.nf_data_emissao + 60
             THEN 1 ELSE 0 END) AS score
    FROM debitos_abertos d
    JOIN nfs_stage ns
      ON ns.revisada_em IS NOT NULL
     AND ns.conta_pagar_id IS NULL
     AND ns.motivo_descarte IS NULL
     AND ns.status NOT IN ('descartada','duplicata')
     AND ns.plano_contas_id IS NOT NULL
     AND abs(COALESCE(ns.valor,0) - d.valor_abs) / GREATEST(COALESCE(ns.valor,0), 0.01) <= 0.05
)
SELECT *
FROM (
    SELECT c.*,
           row_number() OVER (PARTITION BY c.mov_id ORDER BY c.score DESC, c.stage_id) AS rk
    FROM candidatos c
    WHERE c.score >= 3
) ranked
WHERE rk = 1;

-- ═══ 2. RPC: conciliar debito com NF — cria CPR retroativa + vincula, num ato ═══
CREATE OR REPLACE FUNCTION public.conciliar_debito_com_nf(
    p_mov_id uuid,
    p_stage_id uuid,
    p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_mov RECORD;
    v_nf RECORD;
    v_cpr_id uuid;
    v_diverg numeric;
BEGIN
    SELECT * INTO v_mov FROM movimentacoes_bancarias WHERE id = p_mov_id;
    IF v_mov.id IS NULL OR v_mov.tipo <> 'debito' THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Débito não encontrado');
    END IF;
    IF v_mov.classe IS NOT NULL OR v_mov.conta_pagar_id IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Débito já tem destino');
    END IF;

    SELECT * INTO v_nf FROM nfs_stage WHERE id = p_stage_id;
    IF v_nf.id IS NULL OR v_nf.revisada_em IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'NF não encontrada ou não revisada');
    END IF;
    IF v_nf.conta_pagar_id IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'NF já vinculada a uma conta a pagar');
    END IF;
    IF v_nf.plano_contas_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'NF sem plano de contas');
    END IF;

    v_diverg := abs(COALESCE(v_nf.valor,0) - abs(v_mov.valor));

    -- CPR retroativa: valor do DEBITO (caixa real), ja nasce conciliada
    INSERT INTO contas_pagar_receber (
        tipo, descricao, valor, data_vencimento, data_pagamento,
        competencia, nf_data_emissao, nf_numero, nf_cnpj_emitente,
        fornecedor_cliente, parceiro_id,
        plano_contas_id, centro_custo_id,
        status, origem,
        categoria_confirmada,
        aprovado_em, aprovado_por, criado_por,
        conciliado_em, conciliado_por,
        observacao
    ) VALUES (
        'pagar',
        'NF ' || COALESCE(v_nf.nf_numero,'s/n') || ' — ' || COALESCE(v_nf.fornecedor_razao_social, v_nf.fornecedor_cliente, 'fornecedor'),
        abs(v_mov.valor),
        v_mov.data_transacao,
        v_mov.data_transacao,
        date_trunc('month', v_nf.nf_data_emissao)::date,
        v_nf.nf_data_emissao,
        v_nf.nf_numero,
        v_nf.fornecedor_cnpj,
        COALESCE(v_nf.fornecedor_razao_social, v_nf.fornecedor_cliente),
        v_nf.parceiro_id,
        v_nf.plano_contas_id,
        v_nf.centro_custo_id,
        'conciliado',
        'conciliacao_stage_1',
        true,
        now(), p_user_id, p_user_id,
        now(), p_user_id,
        'CPR retroativa criada pela conciliação (débito ' || p_mov_id || ')'
            || CASE WHEN v_diverg >= 0.01
                    THEN ' | DIVERGÊNCIA valor NF ' || COALESCE(v_nf.valor,0) || ' x pago ' || abs(v_mov.valor)
                    ELSE '' END
    ) RETURNING id INTO v_cpr_id;

    UPDATE nfs_stage
    SET conta_pagar_id = v_cpr_id, updated_at = now()
    WHERE id = p_stage_id;

    UPDATE movimentacoes_bancarias
    SET conta_pagar_id      = v_cpr_id,
        classe              = 'despesa_cpr',
        classe_definida_por = 'match_p4',
        conciliado          = true,
        conciliado_em       = now(),
        conciliado_por      = p_user_id
    WHERE id = p_mov_id;

    RETURN jsonb_build_object('ok', true, 'cpr_id', v_cpr_id,
                              'divergencia_valor', (v_diverg >= 0.01));
END;
$function$;

-- ═══ 3. Furos v2: agora considera as duas fontes de sugestao ═══
DROP VIEW IF EXISTS public.vw_conciliacao_furos;
CREATE VIEW public.vw_conciliacao_furos
WITH (security_invoker = true)
AS
SELECT mb.id,
       mb.data_transacao,
       cb.nome_exibicao                          AS banco,
       abs(mb.valor)                             AS valor,
       mb.descricao,
       mb.contraparte_nome,
       mb.contraparte_documento,
       mb.tipo_meio,
       (current_date - mb.data_transacao)        AS dias_em_aberto,
       (scpr.mov_id IS NOT NULL OR snf.mov_id IS NOT NULL) AS tem_sugestao,
       CASE WHEN scpr.mov_id IS NOT NULL THEN 'cpr'
            WHEN snf.mov_id IS NOT NULL THEN 'nf' END      AS fonte_sugestao,
       scpr.cpr_id                               AS sugestao_cpr_id,
       snf.stage_id                              AS sugestao_stage_id,
       COALESCE(scpr.parceiro_nome, snf.fornecedor_razao_social) AS sugestao_contraparte,
       COALESCE(scpr.score, snf.score)           AS sugestao_score
FROM movimentacoes_bancarias mb
LEFT JOIN contas_bancarias cb ON cb.id = mb.conta_bancaria_id
LEFT JOIN vw_despesas_match_sugestoes scpr ON scpr.mov_id = mb.id
LEFT JOIN vw_despesas_match_nf_sugestoes snf ON snf.mov_id = mb.id
WHERE mb.tipo = 'debito'
  AND mb.classe IS NULL
  AND COALESCE(mb.conciliado, false) = false
  AND mb.par_transferencia_id IS NULL
  AND mb.conta_pagar_id IS NULL;
