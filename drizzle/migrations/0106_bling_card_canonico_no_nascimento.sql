CREATE FUNCTION public.fn_bling_card_canonico_novo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.codigo IS NULL OR btrim(NEW.codigo) = '' OR NEW.bling_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.bling_card_canonico
    (sku, bling_id, escolhido_por, motivo, n_candidatos, atualizado_em)
  VALUES
    (NEW.codigo, NEW.bling_id, 'regra', 'card novo — gravado no nascimento', 1, now())
  ON CONFLICT (sku) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_bling_card_canonico_novo() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_bling_card_canonico_novo
AFTER INSERT OR UPDATE OF codigo, bling_id
ON public.produtos
FOR EACH ROW
EXECUTE FUNCTION public.fn_bling_card_canonico_novo();