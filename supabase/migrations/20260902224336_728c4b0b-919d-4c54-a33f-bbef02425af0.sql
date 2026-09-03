CREATE OR REPLACE FUNCTION public.fn_titulo_set_carteira()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_carteira uuid;
  v_forma text;
BEGIN
  IF NEW.carteira_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT cf.carteira_id INTO v_carteira
  FROM carteira_forma cf
  WHERE cf.ativo
    AND cf.forma_pagamento_id = NEW.forma_pagamento_id
    AND (cf.banco_recebimento_id IS NULL OR cf.banco_recebimento_id = NEW.banco_recebimento_id)
    AND (cf.exige_pix_a_prazo IS NULL OR cf.exige_pix_a_prazo = COALESCE(NEW.pix_a_prazo, false))
  ORDER BY cf.prioridade, (cf.banco_recebimento_id IS NULL)
  LIMIT 1;

  IF v_carteira IS NULL THEN
    SELECT COALESCE(f.nome, '(forma nula)') INTO v_forma
    FROM formas_pagamento f WHERE f.id = NEW.forma_pagamento_id;

    RAISE EXCEPTION 'Titulo sem carteira: nao existe regra em carteira_forma para a forma "%" (banco %). Sem carteira o titulo fica invisivel para previsao de caixa e inadimplencia. Cadastre a regra em carteira_forma antes de faturar.',
      COALESCE(v_forma, '?'),
      COALESCE(NEW.banco_recebimento_id::text, 'nulo');
  END IF;

  NEW.carteira_id := v_carteira;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_titulo_set_carteira ON public.titulo_a_receber;

CREATE TRIGGER trg_titulo_set_carteira
  BEFORE INSERT ON public.titulo_a_receber
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_titulo_set_carteira();