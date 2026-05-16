BEGIN;

CREATE OR REPLACE FUNCTION public._meio_pagamento_nascida_paga()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id
  FROM public.meios_pagamento
  WHERE codigo = 'nascida_paga'
    AND ativo = true
  LIMIT 1;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'meio_pagamento nascida_paga não encontrado em meios_pagamento';
  END IF;
  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public._meio_pagamento_nascida_paga() IS
  'Helper interno Conciliação Fase 3. Resolve dinamicamente o UUID do meio nascida_paga. Dimensão silenciosa (Doutrina #89) — código hardcoded, valor via tabela.';

DROP FUNCTION IF EXISTS public.criar_cpr_e_vincular_stage_1(UUID, TEXT, UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION public.criar_cpr_e_vincular_stage_1(
  p_planilha_id UUID,
  p_descricao TEXT,
  p_categoria_id UUID,
  p_parceiro_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    status, meio_pagamento_id,
    conta_id, parceiro_id, fornecedor_cliente,
    pago_em_conta_id, origem,
    categoria_confirmada, criado_por
  ) VALUES (
    'despesa', trim(p_descricao), v_pl.valor_pago, v_pl.data_pagamento, v_pl.data_pagamento,
    'paga', v_meio_id,
    p_categoria_id, p_parceiro_id, COALESCE(v_pl.nome_favorecido, trim(p_descricao)),
    v_pl.conta_bancaria_id, 'conciliacao_stage_1',
    true, p_user_id
  )
  RETURNING id INTO v_cpr_id;

  SELECT movimentacao_bancaria_id INTO v_mov_id FROM public.contas_pagar_receber WHERE id = v_cpr_id;
  IF v_mov_id IS NULL THEN
    PERFORM public.gerar_movimentacao_de_conta(v_cpr_id);
    SELECT movimentacao_bancaria_id INTO v_mov_id FROM public.contas_pagar_receber WHERE id = v_cpr_id;
  END IF;
  IF v_mov_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'CPR criada mas movimentação bancária não foi gerada', 'conta_pagar_id', v_cpr_id);
  END IF;

  UPDATE public.itau_pagamentos_stage
  SET movimentacao_id = v_mov_id,
      conta_pagar_id = v_cpr_id,
      status_conciliacao = 'aguardando_ofx'
  WHERE id = p_planilha_id;

  RETURN jsonb_build_object('ok', true, 'conta_pagar_id', v_cpr_id, 'movimentacao_id', v_mov_id);
END;
$$;

COMMENT ON FUNCTION public.criar_cpr_e_vincular_stage_1(UUID, TEXT, UUID, UUID, UUID) IS
  'Stage 1 — Atalho composto Fase 3. Cria CPR nascida_paga, dispara movimentação, vincula planilha Itaú.';

GRANT EXECUTE ON FUNCTION public.criar_cpr_e_vincular_stage_1(UUID, TEXT, UUID, UUID, UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.criar_cpr_e_vincular_stage_2_debito(UUID, TEXT, UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION public.criar_cpr_e_vincular_stage_2_debito(
  p_ofx_id UUID,
  p_descricao TEXT,
  p_categoria_id UUID,
  p_parceiro_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ofx RECORD;
  v_meio_id UUID;
  v_cpr_id UUID;
  v_mov_id UUID;
BEGIN
  SELECT id, conta_bancaria_id, data_transacao, valor, descricao, status
  INTO v_ofx
  FROM public.ofx_transacoes_stage
  WHERE id = p_ofx_id;

  IF v_ofx.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'OFX não encontrado');
  END IF;
  IF v_ofx.status <> 'pendente' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'OFX não está pendente (status: ' || v_ofx.status || ')');
  END IF;
  IF v_ofx.valor >= 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'Esta RPC é só pra débitos (valor < 0)');
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
    status, meio_pagamento_id,
    conta_id, parceiro_id, fornecedor_cliente,
    pago_em_conta_id, origem,
    categoria_confirmada, criado_por
  ) VALUES (
    'despesa', trim(p_descricao), ABS(v_ofx.valor), v_ofx.data_transacao, v_ofx.data_transacao,
    'paga', v_meio_id,
    p_categoria_id, p_parceiro_id, trim(p_descricao),
    v_ofx.conta_bancaria_id, 'conciliacao_stage_2_debito',
    true, p_user_id
  )
  RETURNING id INTO v_cpr_id;

  SELECT movimentacao_bancaria_id INTO v_mov_id FROM public.contas_pagar_receber WHERE id = v_cpr_id;
  IF v_mov_id IS NULL THEN
    PERFORM public.gerar_movimentacao_de_conta(v_cpr_id);
    SELECT movimentacao_bancaria_id INTO v_mov_id FROM public.contas_pagar_receber WHERE id = v_cpr_id;
  END IF;
  IF v_mov_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'CPR criada mas movimentação bancária não foi gerada', 'conta_pagar_id', v_cpr_id);
  END IF;

  UPDATE public.movimentacoes_bancarias
  SET pg_em = v_ofx.data_transacao,
      conciliado = true,
      conciliado_em = NOW(),
      ofx_transacao_id = p_ofx_id
  WHERE id = v_mov_id;

  UPDATE public.ofx_transacoes_stage
  SET status = 'conciliado'
  WHERE id = p_ofx_id;

  RETURN jsonb_build_object(
    'ok', true,
    'conta_pagar_id', v_cpr_id,
    'movimentacao_id', v_mov_id,
    'pg_em_aplicado', v_ofx.data_transacao
  );
END;
$$;

COMMENT ON FUNCTION public.criar_cpr_e_vincular_stage_2_debito(UUID, TEXT, UUID, UUID, UUID) IS
  'Stage 2 débito — Atalho composto Fase 3. Cria CPR nascida_paga, dispara movimentação, propaga pg_em da data do OFX e marca OFX conciliado.';

GRANT EXECUTE ON FUNCTION public.criar_cpr_e_vincular_stage_2_debito(UUID, TEXT, UUID, UUID, UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.criar_cpr_receita_stage_2_credito(UUID, TEXT, UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION public.criar_cpr_receita_stage_2_credito(
  p_ofx_id UUID,
  p_descricao TEXT,
  p_categoria_id UUID,
  p_parceiro_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ofx RECORD;
  v_meio_id UUID;
  v_cpr_id UUID;
  v_mov_id UUID;
BEGIN
  SELECT id, conta_bancaria_id, data_transacao, valor, descricao, status
  INTO v_ofx
  FROM public.ofx_transacoes_stage
  WHERE id = p_ofx_id;

  IF v_ofx.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'OFX não encontrado');
  END IF;
  IF v_ofx.status <> 'pendente' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'OFX não está pendente (status: ' || v_ofx.status || ')');
  END IF;
  IF v_ofx.valor <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'Esta RPC é só pra créditos (valor > 0)');
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
    status, meio_pagamento_id,
    conta_id, parceiro_id, fornecedor_cliente,
    pago_em_conta_id, origem,
    categoria_confirmada, criado_por
  ) VALUES (
    'receita', trim(p_descricao), v_ofx.valor, v_ofx.data_transacao, v_ofx.data_transacao,
    'paga', v_meio_id,
    p_categoria_id, p_parceiro_id, trim(p_descricao),
    v_ofx.conta_bancaria_id, 'conciliacao_stage_2_credito',
    true, p_user_id
  )
  RETURNING id INTO v_cpr_id;

  SELECT movimentacao_bancaria_id INTO v_mov_id FROM public.contas_pagar_receber WHERE id = v_cpr_id;
  IF v_mov_id IS NULL THEN
    PERFORM public.gerar_movimentacao_de_conta(v_cpr_id);
    SELECT movimentacao_bancaria_id INTO v_mov_id FROM public.contas_pagar_receber WHERE id = v_cpr_id;
  END IF;
  IF v_mov_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'CPR criada mas movimentação bancária não foi gerada', 'conta_pagar_id', v_cpr_id);
  END IF;

  UPDATE public.movimentacoes_bancarias
  SET pg_em = v_ofx.data_transacao,
      conciliado = true,
      conciliado_em = NOW(),
      ofx_transacao_id = p_ofx_id
  WHERE id = v_mov_id;

  UPDATE public.ofx_transacoes_stage
  SET status = 'conciliado'
  WHERE id = p_ofx_id;

  RETURN jsonb_build_object(
    'ok', true,
    'conta_pagar_id', v_cpr_id,
    'movimentacao_id', v_mov_id,
    'pg_em_aplicado', v_ofx.data_transacao
  );
END;
$$;

COMMENT ON FUNCTION public.criar_cpr_receita_stage_2_credito(UUID, TEXT, UUID, UUID, UUID) IS
  'Stage 2 crédito — Fase 3. Cria CPR receita nascida_paga a partir de OFX crédito, dispara movimentação, propaga pg_em.';

GRANT EXECUTE ON FUNCTION public.criar_cpr_receita_stage_2_credito(UUID, TEXT, UUID, UUID, UUID) TO authenticated;

COMMIT;