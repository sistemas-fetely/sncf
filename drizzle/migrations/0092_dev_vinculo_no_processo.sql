CREATE TABLE public.backup_nf_devolucao_vinculo_20261111 (LIKE public.nf_devolucao_vinculo INCLUDING DEFAULTS);
GRANT ALL ON public.backup_nf_devolucao_vinculo_20261111 TO service_role;
ALTER TABLE public.backup_nf_devolucao_vinculo_20261111 ENABLE ROW LEVEL SECURITY;
CREATE POLICY backup_service_role ON public.backup_nf_devolucao_vinculo_20261111 TO service_role USING (true) WITH CHECK (true);
COMMENT ON TABLE public.backup_nf_devolucao_vinculo_20261111 IS 'Snapshot before DEV-VINCULO-NO-PROCESSO backfill; no confirmation';
CREATE FUNCTION public.fn_trg_vinculo_sugerido_devolucao() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $fn$
BEGIN
  IF NEW.status = 'sugerido' AND NEW.classe = 'devolucao_comercial' AND NEW.devolucao_id IS NULL THEN
    NEW.devolucao_id := public.fn_devolucao_resolver_por_nf(NEW.nf_saida_id);
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.fn_trg_vinculo_sugerido_devolucao() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_trg_vinculo_sugerido_devolucao() TO service_role;
CREATE TRIGGER trg_vinculo_sugerido_devolucao BEFORE INSERT ON public.nf_devolucao_vinculo FOR EACH ROW EXECUTE FUNCTION public.fn_trg_vinculo_sugerido_devolucao();
DO $migration$
DECLARE d text; old_text text; new_text text;
BEGIN
  SELECT pg_get_functiondef('public.fn_devolucao_sugerir_vinculos()'::regprocedure) INTO d;
  old_text := 'grau_sugerido, itens, status, classe)';
  IF strpos(d, old_text)=0 THEN RAISE EXCEPTION 'Unexpected suggestion function definition'; END IF;
  d := replace(d, old_text, 'grau_sugerido, itens, status, classe, devolucao_id)');
  old_text := 'ELSE ''devolucao_comercial'' END';
  IF strpos(d, old_text)=0 THEN RAISE EXCEPTION 'Unexpected class definition'; END IF;
  d := replace(d, old_text, 'ELSE ''devolucao_comercial'' END,
           CASE WHEN p.eh_consig_remessa AND NOT p.eh_venda THEN NULL
                ELSE public.fn_devolucao_resolver_por_nf(p.nf_id) END');
  EXECUTE d;
  SELECT pg_get_viewdef('public.vw_devolucao_funil'::regclass,true) INTO d;
  old_text := 'v.devolucao_id = b_1.id AND v.status = ''sugerido''::text';
  new_text := '(v.devolucao_id = b_1.id OR (v.devolucao_id IS NULL AND v.nf_saida_id = b_1.nf_original_id)) AND v.status = ''sugerido''::text AND v.classe = ''devolucao_comercial''::text';
  IF (length(d)-length(replace(d,old_text,'')))/length(old_text) <> 2 THEN RAISE EXCEPTION 'Unexpected suggested view predicates'; END IF;
  d := replace(d,old_text,new_text);
  old_text := 'fu.nf_vinculo_sugerido_id';
  IF strpos(d,old_text)=0 THEN RAISE EXCEPTION 'Unexpected funil output'; END IF;
  d := replace(d,old_text,'fu.nf_vinculo_sugerido_id,
    (SELECT v.grau_sugerido FROM public.nf_devolucao_vinculo v WHERE v.id = fu.nf_vinculo_sugerido_id) AS grau_sugerido');
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_devolucao_funil AS ' || d;
  SELECT pg_get_viewdef('public.vw_devolucao_vinculo_mesa'::regclass,true) INTO d;
  IF strpos(d,'v.classe')=0 THEN RAISE EXCEPTION 'Unexpected triage output'; END IF;
  d := replace(d,'    v.classe','    v.classe, v.devolucao_id,
    (SELECT dv.numero FROM public.devolucao dv WHERE dv.id=v.devolucao_id) AS devolucao_numero');
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_devolucao_vinculo_mesa AS ' || d;
END;
$migration$;