CREATE OR REPLACE FUNCTION public.vincular_nf_a_conta(
  p_nf_id uuid,
  p_conta_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nf record;
  v_conta record;
BEGIN
  SELECT * INTO v_nf FROM nfs_stage WHERE id = p_nf_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'NF não encontrada');
  END IF;

  SELECT * INTO v_conta FROM contas_pagar_receber WHERE id = p_conta_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Conta não encontrada');
  END IF;

  IF v_nf.conta_pagar_id IS NOT NULL AND v_nf.conta_pagar_id != p_conta_id THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'NF já está vinculada a outra conta');
  END IF;

  IF v_conta.nf_stage_id IS NOT NULL AND v_conta.nf_stage_id != p_nf_id THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Conta já possui outra NF vinculada');
  END IF;

  -- Lado 1: NF aponta pra CPR
  UPDATE nfs_stage SET conta_pagar_id = p_conta_id WHERE id = p_nf_id;

  -- Lado 2: CPR aponta pra NF (FALTAVA — Doutrina #53)
  UPDATE contas_pagar_receber SET nf_stage_id = p_nf_id WHERE id = p_conta_id;

  -- Enriquecer CPR com dados da NF
  UPDATE contas_pagar_receber
  SET
    parceiro_id = COALESCE(parceiro_id, (
      SELECT id FROM parceiros_comerciais
      WHERE cnpj = v_nf.fornecedor_cnpj
      LIMIT 1
    )),
    valor = COALESCE(valor, v_nf.valor_total),
    descricao = COALESCE(descricao, 'NF ' || v_nf.numero_nf || ' - ' || v_nf.fornecedor_razao_social)
  WHERE id = p_conta_id;

  RETURN jsonb_build_object(
    'ok', true,
    'success', true,
    'message', 'NF vinculada com sucesso'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.vincular_nf_a_conta IS
'Vincula NF a CPR preenchendo AMBOS os lados da FK (conta_pagar_id E nf_stage_id). Doutrina #53.';