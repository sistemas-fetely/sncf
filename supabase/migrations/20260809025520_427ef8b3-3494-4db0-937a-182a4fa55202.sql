CREATE OR REPLACE FUNCTION public.regerar_nome_operacional(p_skus text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.sncf_produtos
     SET nome_operacional = public.fn_gerar_nome_operacional(sku)
   WHERE sku = ANY(p_skus);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.regerar_nome_operacional(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regerar_nome_operacional(text[]) TO service_role;