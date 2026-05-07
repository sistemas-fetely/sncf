-- BLOCO 1 — Backfill
UPDATE public.contas_pagar_receber AS cpr
SET
  status = 'paga',
  pago_em = COALESCE(
    cpr.pago_em,
    (cpr.data_pagamento::timestamptz),
    mov.data_transacao::timestamptz,
    NOW()
  )
FROM public.movimentacoes_bancarias AS mov
WHERE cpr.movimentacao_bancaria_id = mov.id
  AND cpr.status NOT IN ('paga', 'conciliado', 'cancelado');

-- BLOCO 2 — Trigger estrutural
CREATE OR REPLACE FUNCTION public.fn_sync_status_cpr_apos_movimentacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.conta_pagar_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.conta_pagar_id IS NOT DISTINCT FROM NEW.conta_pagar_id THEN
    RETURN NEW;
  END IF;

  UPDATE public.contas_pagar_receber
     SET
       status = 'paga',
       pago_em = COALESCE(
         pago_em,
         data_pagamento::timestamptz,
         NEW.data_transacao::timestamptz,
         NOW()
       )
   WHERE id = NEW.conta_pagar_id
     AND status NOT IN ('paga', 'conciliado', 'cancelado');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_status_cpr_apos_movimentacao
  ON public.movimentacoes_bancarias;

CREATE TRIGGER trg_sync_status_cpr_apos_movimentacao
  AFTER INSERT OR UPDATE OF conta_pagar_id ON public.movimentacoes_bancarias
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_status_cpr_apos_movimentacao();