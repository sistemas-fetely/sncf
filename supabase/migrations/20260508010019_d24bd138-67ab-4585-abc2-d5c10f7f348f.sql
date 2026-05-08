CREATE OR REPLACE FUNCTION public.fn_desvincular_nf_ao_cancelar()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'cancelado' AND (OLD.status IS NULL OR OLD.status != 'cancelado') THEN
    IF NEW.nf_stage_id IS NOT NULL THEN
      UPDATE public.nfs_stage
      SET conta_pagar_id = NULL
      WHERE id = NEW.nf_stage_id;

      NEW.nf_stage_id := NULL;
    END IF;

    UPDATE public.nfs_stage
    SET conta_pagar_id = NULL
    WHERE conta_pagar_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_desvincular_nf_ao_cancelar ON public.contas_pagar_receber;
CREATE TRIGGER trg_desvincular_nf_ao_cancelar
  BEFORE UPDATE ON public.contas_pagar_receber
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_desvincular_nf_ao_cancelar();

COMMENT ON FUNCTION public.fn_desvincular_nf_ao_cancelar IS
'Desvíncula NF automaticamente quando CPR é cancelada. NF volta pro Stage sem vínculo, pronta pra ser vinculada em outra CPR.';