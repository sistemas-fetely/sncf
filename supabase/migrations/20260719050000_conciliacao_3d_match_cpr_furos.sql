-- 🔵 SNCF
-- Espelho: Conciliacao Fatia 3-D peca 2 — match-engine despesas (debito x CPR) + view furos
-- Aplicado no banco vivo em 19/07/2026. SISTEMA SUGERE / HUMANO DECIDE.
-- ═══ 1. Sugestoes de match debito bancario x CPR de pagamento ═══
-- Score (CNPJ dominante, conforme Mapa): CNPJ do parceiro no descritivo/contraparte = 3;
-- valor exato (±1 centavo) = 2, valor ±1%% = 1; data ±5 dias do vencimento ou pagamento = 1.
-- Sugere o melhor candidato por debito com score >= 3.

DROP VIEW IF EXISTS public.vw_despesas_match_sugestoes;
CREATE VIEW public.vw_despesas_match_sugestoes
WITH (security_invoker = true)
AS
WITH debitos_abertos AS (
    SELECT mb.id, mb.data_transacao, mb.descricao, mb.contraparte_documento,
           abs(mb.valor) AS valor_abs, mb.conta_bancaria_id,
           regexp_replace(COALESCE(mb.contraparte_documento,'') || ' ' || COALESCE(mb.descricao,''), '\D', '', 'g') AS digitos
    FROM movimentacoes_bancarias mb
    WHERE mb.tipo = 'debito'
      AND mb.classe IS NULL
      AND COALESCE(mb.conciliado, false) = false
      AND mb.par_transferencia_id IS NULL
      AND mb.conta_pagar_id IS NULL
),
candidatos AS (
    SELECT d.id AS mov_id,
           d.data_transacao, d.descricao AS mov_descricao, d.valor_abs,
           cpr.id AS cpr_id, cpr.descricao AS cpr_descricao,
           cpr.valor AS cpr_valor, cpr.status AS cpr_status,
           cpr.data_vencimento, cpr.data_pagamento,
           p.cnpj AS parceiro_cnpj, p.razao_social AS parceiro_nome,
           (CASE WHEN p.cnpj IS NOT NULL
                  AND length(regexp_replace(p.cnpj, '\D', '', 'g')) >= 8
                  AND position(regexp_replace(p.cnpj, '\D', '', 'g') IN d.digitos) > 0
             THEN 3 ELSE 0 END)
         + (CASE WHEN abs(COALESCE(cpr.valor,0) - d.valor_abs) < 0.01 THEN 2
                 WHEN COALESCE(cpr.valor,0) > 0
                  AND abs(COALESCE(cpr.valor,0) - d.valor_abs) / cpr.valor <= 0.01 THEN 1
                 ELSE 0 END)
         + (CASE WHEN COALESCE(cpr.data_pagamento, cpr.data_vencimento)
                      BETWEEN d.data_transacao - 5 AND d.data_transacao + 5
             THEN 1 ELSE 0 END) AS score
    FROM debitos_abertos d
    JOIN contas_pagar_receber cpr
      ON cpr.tipo = 'pagar'
     AND cpr.status NOT IN ('cancelado','conciliado')
     AND abs(COALESCE(cpr.valor,0) - d.valor_abs) / GREATEST(COALESCE(cpr.valor,0), 0.01) <= 0.05
    LEFT JOIN parceiros_comerciais p ON p.id = cpr.parceiro_id
)
SELECT *
FROM (
    SELECT c.*,
           row_number() OVER (PARTITION BY c.mov_id ORDER BY c.score DESC, c.cpr_id) AS rk
    FROM candidatos c
    WHERE c.score >= 3
) ranked
WHERE rk = 1;

-- ═══ 2. RPC: confirmar match (1 clique — HUMANO DECIDE) ═══
CREATE OR REPLACE FUNCTION public.confirmar_match_despesa(
    p_mov_id uuid,
    p_cpr_id uuid,
    p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_mov RECORD;
    v_cpr RECORD;
BEGIN
    SELECT * INTO v_mov FROM movimentacoes_bancarias WHERE id = p_mov_id;
    IF v_mov.id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Movimentação não encontrada');
    END IF;
    IF v_mov.tipo <> 'debito' THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Movimentação não é débito');
    END IF;
    IF v_mov.classe IS NOT NULL OR v_mov.conta_pagar_id IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'Débito já tem destino: ' || COALESCE(v_mov.classe, 'vínculo CPR'));
    END IF;

    SELECT * INTO v_cpr FROM contas_pagar_receber WHERE id = p_cpr_id;
    IF v_cpr.id IS NULL OR v_cpr.tipo <> 'pagar' THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'CPR de pagamento não encontrada');
    END IF;
    IF v_cpr.status IN ('cancelado','conciliado') THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'CPR já está ' || v_cpr.status);
    END IF;

    UPDATE movimentacoes_bancarias
    SET conta_pagar_id     = p_cpr_id,
        classe             = 'despesa_cpr',
        classe_definida_por = 'match_p4',
        conciliado         = true,
        conciliado_em      = now(),
        conciliado_por     = p_user_id
    WHERE id = p_mov_id;

    -- Selo na CPR: o extrato e a prova do pagamento
    UPDATE contas_pagar_receber
    SET status         = 'conciliado',
        data_pagamento = COALESCE(data_pagamento, v_mov.data_transacao),
        conciliado_em  = now(),
        conciliado_por = p_user_id,
        updated_at     = now()
    WHERE id = p_cpr_id;

    RETURN jsonb_build_object('ok', true, 'mov_id', p_mov_id, 'cpr_id', p_cpr_id);
END;
$function$;

-- ═══ 3. FUROS: todo debito sem destino, nomeado e com idade ═══
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
       (s.mov_id IS NOT NULL)                    AS tem_sugestao,
       s.cpr_id                                  AS sugestao_cpr_id,
       s.parceiro_nome                           AS sugestao_parceiro,
       s.score                                   AS sugestao_score
FROM movimentacoes_bancarias mb
LEFT JOIN contas_bancarias cb ON cb.id = mb.conta_bancaria_id
LEFT JOIN vw_despesas_match_sugestoes s ON s.mov_id = mb.id
WHERE mb.tipo = 'debito'
  AND mb.classe IS NULL
  AND COALESCE(mb.conciliado, false) = false
  AND mb.par_transferencia_id IS NULL
  AND mb.conta_pagar_id IS NULL;
