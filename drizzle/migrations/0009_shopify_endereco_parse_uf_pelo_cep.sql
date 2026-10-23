DO $mig$
DECLARE d text; d0 text;
BEGIN
  d0 := pg_get_functiondef('public.fn_shopify_endereco_parse'::regproc);
  d := replace(d0,
    $s$fn_normalizar_uf(coalesce(nullif(p_addr->>'province_code',''), p_addr->>'province')),$s$,
    $s$fn_normalizar_uf(fn_uf_pelo_cep(p_addr->>'city', coalesce(nullif(p_addr->>'province_code',''), p_addr->>'province'), p_addr->>'zip')),$s$);
  IF d = d0 OR d NOT LIKE '%fn_uf_pelo_cep(p_addr%' THEN
    RAISE EXCEPTION 'patch fn_shopify_endereco_parse nao aplicou';
  END IF;
  EXECUTE d;
END $mig$;