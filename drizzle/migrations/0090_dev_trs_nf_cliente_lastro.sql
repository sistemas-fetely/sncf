CREATE OR REPLACE FUNCTION public.fn_devolucao_nf_cliente_confirmada(p_devolucao_id uuid, p_nf_original_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog
AS $$
  SELECT EXISTS (SELECT 1 FROM public.nf_devolucao_vinculo v
    WHERE v.status = 'confirmado' AND v.classe = 'devolucao_comercial'
      AND (v.devolucao_id = p_devolucao_id OR v.nf_saida_id = p_nf_original_id));
$$;
REVOKE ALL ON FUNCTION public.fn_devolucao_nf_cliente_confirmada(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_devolucao_nf_cliente_confirmada(uuid, uuid) TO authenticated, service_role;

DO $migration$
DECLARE f text; old text := $old$IF coalesce(d.nf_dev_status,'') <> 'autorizada' THEN$old$;
BEGIN
  f := pg_get_functiondef('public.fn_devolucao_criar_trs_retorno(uuid)'::regprocedure);
  IF position(old IN f) = 0 THEN RAISE EXCEPTION 'Trava fiscal original nao encontrada'; END IF;
  f := replace(f, old, $new$IF coalesce(d.nf_dev_status,'') <> 'autorizada' AND NOT public.fn_devolucao_nf_cliente_confirmada(d.id, d.nf_original_id) THEN$new$);
  EXECUTE f;
END $migration$;

CREATE OR REPLACE FUNCTION public.fn_trg_devolucao_trs_nf_cliente()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog
AS $$
DECLARE d record; v_trs jsonb;
BEGIN
  IF NEW.status IS DISTINCT FROM 'confirmado' OR NEW.classe IS DISTINCT FROM 'devolucao_comercial' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS NOT DISTINCT FROM NEW.status AND OLD.classe IS NOT DISTINCT FROM NEW.classe
       AND OLD.devolucao_id IS NOT DISTINCT FROM NEW.devolucao_id AND OLD.nf_saida_id IS NOT DISTINCT FROM NEW.nf_saida_id THEN RETURN NEW; END IF;
  END IF;
  FOR d IN SELECT id FROM public.devolucao
    WHERE id = NEW.devolucao_id OR nf_original_id = NEW.nf_saida_id ORDER BY id
  LOOP
    BEGIN
      v_trs := public.fn_devolucao_criar_trs_retorno(d.id);
    EXCEPTION WHEN OTHERS THEN
      PERFORM public.fn_devolucao_trs_auto_marcar(d.id, SQLERRM);
    END;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_trg_devolucao_trs_nf_cliente() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_trg_devolucao_trs_nf_cliente() TO service_role;
CREATE TRIGGER trg_nf_vinculo_trs_cliente
AFTER INSERT OR UPDATE OF status, classe, devolucao_id, nf_saida_id ON public.nf_devolucao_vinculo
FOR EACH ROW EXECUTE FUNCTION public.fn_trg_devolucao_trs_nf_cliente();

DO $migration$
DECLARE f text; old text := $old$v.devolucao_id = b_1.id AND v.status = 'confirmado'::text$old$;
BEGIN
  f := pg_get_viewdef('public.vw_devolucao_funil'::regclass, true);
  IF position(old IN f) = 0 THEN RAISE EXCEPTION 'Lastro original do funil nao encontrado'; END IF;
  f := replace(f, old, $new$(v.devolucao_id = b_1.id OR v.nf_saida_id = b_1.nf_original_id) AND v.status = 'confirmado'::text AND v.classe = 'devolucao_comercial'::text$new$);
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_devolucao_funil AS ' || regexp_replace(f, ';\s*$', '');
END $migration$;