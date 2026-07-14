-- 🔵 SNCF — Espelho DDL Sprint Prorrogação F2b (aplicado no banco em 10/07/2026)

-- Colunas de prorrogação
ALTER TABLE titulo_a_receber
  ADD COLUMN IF NOT EXISTS prorrogacao_nova_data        date,
  ADD COLUMN IF NOT EXISTS prorrogacao_solicitada_em    timestamptz;

-- Constraint de tipo ampliada
ALTER TABLE remessas_safra
  DROP CONSTRAINT IF EXISTS remessas_safra_tipo_check;
ALTER TABLE remessas_safra
  ADD CONSTRAINT remessas_safra_tipo_check
    CHECK (tipo = ANY (ARRAY['entrada'::text, 'baixa'::text, 'prorrogacao'::text]));

-- RPC solicitar_prorrogacao_boleto
CREATE OR REPLACE FUNCTION solicitar_prorrogacao_boleto(
  p_titulo_id uuid,
  p_nova_data  date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_titulo titulo_a_receber%ROWTYPE;
BEGIN
  SELECT * INTO v_titulo FROM titulo_a_receber WHERE id = p_titulo_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Título não encontrado');
  END IF;
  IF v_titulo.boleto_status IS DISTINCT FROM 'registrado' THEN
    RETURN jsonb_build_object('ok', false, 'erro',
      'Prorrogação só é permitida para boleto registrado. Status atual: ' || COALESCE(v_titulo.boleto_status, 'nulo'));
  END IF;
  IF v_titulo.data_vencimento_atual < CURRENT_DATE THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Boleto já vencido. Use reemissão para boletos vencidos.');
  END IF;
  IF p_nova_data <= CURRENT_DATE THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Nova data de vencimento deve ser posterior a hoje.');
  END IF;
  IF v_titulo.prorrogacao_nova_data IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro',
      'Já existe uma prorrogação pendente para este título. Cancele-a antes de solicitar outra.');
  END IF;
  UPDATE titulo_a_receber SET prorrogacao_nova_data = p_nova_data WHERE id = p_titulo_id;
  RETURN jsonb_build_object('ok', true, 'nova_data', p_nova_data);
END;
$$;
GRANT EXECUTE ON FUNCTION solicitar_prorrogacao_boleto(uuid, date) TO authenticated;

-- RPC cancelar_prorrogacao_boleto
CREATE OR REPLACE FUNCTION cancelar_prorrogacao_boleto(
  p_titulo_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_titulo titulo_a_receber%ROWTYPE;
BEGIN
  SELECT * INTO v_titulo FROM titulo_a_receber WHERE id = p_titulo_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Título não encontrado');
  END IF;
  IF v_titulo.prorrogacao_nova_data IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Não há prorrogação pendente para este título.');
  END IF;
  IF v_titulo.prorrogacao_solicitada_em IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Remessa já gerada. Não é possível cancelar após o envio ao banco.');
  END IF;
  UPDATE titulo_a_receber
  SET prorrogacao_nova_data = NULL, prorrogacao_solicitada_em = NULL
  WHERE id = p_titulo_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION cancelar_prorrogacao_boleto(uuid) TO authenticated;
