CREATE OR REPLACE FUNCTION public.recalcular_status_nf_stage(p_stage_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_boletos int;
  v_lancadas int;
  v_status_atual text;
  v_novo_status text;
BEGIN
  IF p_stage_id IS NULL THEN
    RETURN;
  END IF;

  SELECT status INTO v_status_atual
  FROM nfs_stage
  WHERE id = p_stage_id;

  IF v_status_atual IS NULL OR v_status_atual = 'descartada' THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_total_boletos
  FROM nfs_stage_documentos
  WHERE nfs_stage_id = p_stage_id
    AND tipo = 'pdf_boleto';

  SELECT COUNT(*) INTO v_lancadas
  FROM contas_pagar_receber
  WHERE nf_stage_id = p_stage_id;

  IF v_total_boletos = 0 THEN
    v_novo_status := CASE WHEN v_lancadas >= 1 THEN 'vinculada' ELSE 'nao_vinculada' END;
  ELSIF v_lancadas = 0 THEN
    v_novo_status := 'nao_vinculada';
  ELSIF v_lancadas < v_total_boletos THEN
    v_novo_status := 'parcial';
  ELSE
    v_novo_status := 'vinculada';
  END IF;

  IF v_novo_status IS DISTINCT FROM v_status_atual THEN
    UPDATE nfs_stage
    SET status = v_novo_status, updated_at = now()
    WHERE id = p_stage_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_cpr_recalc_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    PERFORM recalcular_status_nf_stage(NEW.nf_stage_id);
  ELSIF (TG_OP = 'UPDATE') THEN
    IF NEW.nf_stage_id IS DISTINCT FROM OLD.nf_stage_id THEN
      PERFORM recalcular_status_nf_stage(OLD.nf_stage_id);
      PERFORM recalcular_status_nf_stage(NEW.nf_stage_id);
    ELSE
      PERFORM recalcular_status_nf_stage(NEW.nf_stage_id);
    END IF;
  ELSIF (TG_OP = 'DELETE') THEN
    PERFORM recalcular_status_nf_stage(OLD.nf_stage_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_cpr_recalc_stage_status ON contas_pagar_receber;
CREATE TRIGGER trg_cpr_recalc_stage_status
AFTER INSERT OR UPDATE OF nf_stage_id OR DELETE
ON contas_pagar_receber
FOR EACH ROW
EXECUTE FUNCTION tg_cpr_recalc_stage();

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM nfs_stage WHERE status <> 'descartada' LOOP
    PERFORM recalcular_status_nf_stage(r.id);
  END LOOP;
END $$;