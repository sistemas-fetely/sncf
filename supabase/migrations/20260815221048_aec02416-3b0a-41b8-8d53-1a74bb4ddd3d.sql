CREATE OR REPLACE FUNCTION public.__tmp_apply_install_sql(p_sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  EXECUTE p_sql;
END;
$fn$;
REVOKE ALL ON FUNCTION public.__tmp_apply_install_sql(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.__tmp_apply_install_sql(text) TO postgres;