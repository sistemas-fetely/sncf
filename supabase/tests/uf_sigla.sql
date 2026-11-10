-- Run against the database; all partner changes are rolled back.
BEGIN;
DO $test$
DECLARE v text;
BEGIN
  IF public.fn_uf_sigla('rs') IS DISTINCT FROM 'RS' THEN RAISE EXCEPTION 'Sigla deve virar RS'; END IF;
  IF public.fn_uf_sigla('Rio Grande do Sul') IS DISTINCT FROM 'RS' THEN RAISE EXCEPTION 'Nome deve virar RS'; END IF;
  IF public.fn_uf_sigla('São Paulo') IS DISTINCT FROM 'SP' THEN RAISE EXCEPTION 'Nome acentuado deve virar SP'; END IF;
  IF public.fn_uf_sigla('Sao Paulo') IS DISTINCT FROM 'SP' THEN RAISE EXCEPTION 'Nome sem acento deve virar SP'; END IF;
  IF public.fn_uf_sigla('') IS NOT NULL THEN RAISE EXCEPTION 'Vazio deve virar null'; END IF;
  IF public.fn_uf_sigla('0') IS NOT NULL THEN RAISE EXCEPTION 'Zero deve virar null'; END IF;
  BEGIN
    PERFORM public.fn_uf_sigla('RS-BR');
    RAISE EXCEPTION 'Formato inválido deveria falhar';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  UPDATE public.parceiros_comerciais SET uf = 'Rio Grande do Sul'
    WHERE id = '608dadfe-1650-43a4-85d8-18b06b0a499d' RETURNING uf INTO v;
  IF v IS DISTINCT FROM 'RS' THEN RAISE EXCEPTION 'Trigger não gravou RS'; END IF;
END $test$;
ROLLBACK;