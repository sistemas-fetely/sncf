-- Drop trigger antigo que causa conflito
DROP TRIGGER IF EXISTS trg_desvincular_nf_ao_cancelar ON contas_pagar_receber;
DROP FUNCTION IF EXISTS public.fn_desvincular_nf_ao_cancelar();

-- RPC: cancelar conta e desvincular NF
CREATE OR REPLACE FUNCTION public.cancelar_conta_pagar(p_conta_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conta record;
  v_nf_stage_id uuid;
BEGIN
  SELECT * INTO v_conta
  FROM contas_pagar_receber
  WHERE id = p_conta_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Conta não encontrada');
  END IF;

  IF v_conta.status = 'paga' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não é possível cancelar conta já paga');
  END IF;

  IF v_conta.status = 'cancelado' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Conta já está cancelada');
  END IF;

  v_nf_stage_id := v_conta.nf_stage_id;

  UPDATE contas_pagar_receber
  SET nf_stage_id = NULL
  WHERE id = p_conta_id;

  IF v_nf_stage_id IS NOT NULL THEN
    UPDATE nfs_stage
    SET conta_pagar_id = NULL
    WHERE id = v_nf_stage_id;
  END IF;

  UPDATE nfs_stage
  SET conta_pagar_id = NULL
  WHERE conta_pagar_id = p_conta_id;

  UPDATE contas_pagar_receber
  SET status = 'cancelado'
  WHERE id = p_conta_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Conta cancelada e NF desvinculada com sucesso',
    'nf_desvinculada', v_nf_stage_id IS NOT NULL
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.cancelar_conta_pagar IS
'Cancela CPR e desvincula NF automaticamente. Ordem controlada pra evitar conflito.';