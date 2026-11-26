-- Read-only acceptance assertions; no product is created or changed.
BEGIN;
DO $test$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.vw_shopify_cadastro_fila
  WHERE cod_cadastro IN ('02165','02166','02169','02179')
    AND 'aguardando_medicao' = ANY(avisos)
    AND NOT pode_enviar AND NOT pode_adicionar_variante;
  IF n <> 4 THEN RAISE EXCEPTION 'Esperava 4 SKUs Jingle Pop bloqueados por medição, achei %', n; END IF;
  SELECT count(*) INTO n FROM public.vw_shopify_cadastro_fila
  WHERE cod_cadastro BETWEEN '02160' AND '02180'
    AND cod_cadastro NOT IN ('02165','02166','02169','02179')
    AND NOT ('aguardando_medicao' = ANY(avisos)) AND pode_enviar;
  IF n <> 17 THEN RAISE EXCEPTION 'Esperava os outros 17 SKUs prontos, achei %', n; END IF;
END $test$;
ROLLBACK;