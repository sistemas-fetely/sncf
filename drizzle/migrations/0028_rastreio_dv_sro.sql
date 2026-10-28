CREATE OR REPLACE FUNCTION public.fn_sro_codigo_valido(p_codigo text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $f$
-- 28/10/2026 RASTREIO-DV-SRO: formato AA123456789AA + dígito verificador SRO (pesos 8,6,4,2,3,5,9,7 mod 11).
DECLARE v text; s int := 0; p int[] := ARRAY[8,6,4,2,3,5,9,7]; r int; dv int;
BEGIN
  v := upper(regexp_replace(coalesce(p_codigo,''), '\s', '', 'g'));
  IF v !~ '^[A-Z]{2}[0-9]{9}[A-Z]{2}$' THEN RETURN false; END IF;
  FOR i IN 1..8 LOOP s := s + substr(v, 2+i, 1)::int * p[i]; END LOOP;
  r := s % 11;
  dv := CASE WHEN r = 0 THEN 5 WHEN r = 1 THEN 0 ELSE 11 - r END;
  RETURN substr(v, 11, 1)::int = dv;
END $f$;
GRANT EXECUTE ON FUNCTION public.fn_sro_codigo_valido(text) TO authenticated, service_role;

DO $do$
DECLARE d text; n text; alvo record;
BEGIN
  FOR alvo IN SELECT * FROM (VALUES
    ('public.fn_mesa_sp_despachar(uuid,text,text,text)', 'IF v_cod !~ ''^[A-Z]{2}[0-9]{9}[A-Z]{2}$'' THEN', 'v_cod'),
    ('public.fn_mesa_sp_registrar_rastreio(uuid,text)', 'if v_codigo !~ ''^[A-Z]{2}[0-9]{9}[A-Z]{2}$'' then', 'v_codigo'),
    ('public.fn_registrar_rastreio_pedido(uuid,text,text,text)', 'if v_codigo !~ ''^[A-Z]{2}[0-9]{9}[A-Z]{2}$'' then', 'v_codigo')
  ) t(sig, trecho, var) LOOP
    d := pg_get_functiondef(alvo.sig::regprocedure);
    IF position('fn_sro_codigo_valido' in d) > 0 THEN CONTINUE; END IF;
    n := replace(d, alvo.trecho,
      'IF ' || alvo.var || ' ~ ''^[A-Z]{2}[0-9]{9}[A-Z]{2}$'' AND NOT public.fn_sro_codigo_valido(' || alvo.var || ') THEN' || chr(10) ||
      '    RAISE EXCEPTION ''Código % inválido: o dígito de controle não confere — confira o comprovante.'', ' || alvo.var || ' USING ERRCODE = ''P0001'';' || chr(10) ||
      '  END IF; -- RASTREIO-DV-SRO 28/10/2026' || chr(10) || '  ' || alvo.trecho);
    IF n = d THEN RAISE EXCEPTION 'Trecho de formato não encontrado em %', alvo.sig; END IF;
    EXECUTE n;
  END LOOP;
END $do$;