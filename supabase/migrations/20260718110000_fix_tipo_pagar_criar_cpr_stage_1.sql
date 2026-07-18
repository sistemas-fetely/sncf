-- 🔵 SNCF
-- Fix: criar_cpr_e_vincular_stage_1 gravava tipo='despesa' (CHECK aceita só pagar/receber)
-- Função nunca rodou com sucesso — corrigida antes do primeiro uso real
-- Aplicado no banco em 18/07/2026; este arquivo é o espelho
-- Destino: supabase/migrations/ via GitHub web

CREATE OR REPLACE FUNCTION public.criar_cpr_e_vincular_stage_1(
    p_planilha_id uuid,
    p_descricao text,
    p_categoria_id uuid,
    p_parceiro_id uuid DEFAULT NULL::uuid,
    p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_pl RECORD;
    v_meio_id UUID;
    v_cpr_id UUID;
    v_mov_id UUID;
BEGIN
    SELECT id, conta_bancaria_id, valor_pago, data_pagamento,
           nome_favorecido, cnpj_favorecido, movimentacao_id, status_conciliacao
    INTO v_pl
    FROM public.itau_pagamentos_stage
    WHERE id = p_planilha_id;

    IF v_pl.id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Linha da planilha não encontrada');
    END IF;

    IF v_pl.movimentacao_id IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Linha já está vinculada a uma movimentação');
    END IF;

    IF v_pl.conta_bancaria_id IS NULL OR v_pl.valor_pago IS NULL OR v_pl.data_pagamento IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Dados da planilha incompletos (conta_bancaria_id, valor_pago ou data_pagamento NULL)');
    END IF;

    IF p_descricao IS NULL OR length(trim(p_descricao)) = 0 THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Descrição obrigatória');
    END IF;

    IF p_categoria_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'motivo', 'Categoria do plano de contas obrigatória');
    END IF;

    v_meio_id := public._meio_pagamento_nascida_paga();

    INSERT INTO public.contas_pagar_receber (
        tipo, descricao, valor, data_vencimento, data_pagamento,
        status, meio_pagamento_id, plano_contas_id, parceiro_id,
        fornecedor_cliente, pago_em_conta_id, origem,
        categoria_confirmada, criado_por
    ) VALUES (
        'pagar',  -- FIX: era 'despesa', CHECK aceita só pagar/receber
        trim(p_descricao),
        v_pl.valor_pago,
        v_pl.data_pagamento,
        v_pl.data_pagamento,
        'paga',
        v_meio_id,
        p_categoria_id,
        p_parceiro_id,
        COALESCE(v_pl.nome_favorecido, trim(p_descricao)),
        v_pl.conta_bancaria_id,
        'conciliacao_stage_1',
        true,
        p_user_id
    ) RETURNING id INTO v_cpr_id;

    SELECT movimentacao_bancaria_id INTO v_mov_id
    FROM public.contas_pagar_receber WHERE id = v_cpr_id;

    IF v_mov_id IS NULL THEN
        PERFORM public.gerar_movimentacao_de_conta(v_cpr_id);
        SELECT movimentacao_bancaria_id INTO v_mov_id
        FROM public.contas_pagar_receber WHERE id = v_cpr_id;
    END IF;

    IF v_mov_id IS NULL THEN
        RETURN jsonb_build_object(
            'ok', false,
            'motivo', 'CPR criada mas movimentação bancária não foi gerada',
            'conta_pagar_id', v_cpr_id
        );
    END IF;

    UPDATE public.itau_pagamentos_stage
    SET movimentacao_id = v_mov_id,
        conta_pagar_id = v_cpr_id,
        status_conciliacao = 'aguardando_ofx'
    WHERE id = p_planilha_id;

    RETURN jsonb_build_object('ok', true, 'conta_pagar_id', v_cpr_id, 'movimentacao_id', v_mov_id);
END;
$function$;
