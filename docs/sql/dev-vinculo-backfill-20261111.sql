-- Executed once through run_sql on 2026-11-11. DO NOT rerun.
-- Result: snapshot 30; updated 15; DEV-2326 included; status remains suggested.
WITH backup AS (
  INSERT INTO public.backup_nf_devolucao_vinculo_20261111
  SELECT * FROM public.nf_devolucao_vinculo RETURNING id
), atualizados AS (
  UPDATE public.nf_devolucao_vinculo v
  SET devolucao_id=public.fn_devolucao_resolver_por_nf(v.nf_saida_id)
  WHERE v.status='sugerido' AND v.devolucao_id IS NULL
    AND v.classe='devolucao_comercial'
    AND public.fn_devolucao_resolver_por_nf(v.nf_saida_id) IS NOT NULL
    AND (SELECT count(*) FROM backup)>0
  RETURNING v.id,v.devolucao_id,v.status
)
SELECT (SELECT count(*) FROM backup) backup_linhas, count(*) alterados,
  bool_or(id='ec0bc10a-281c-4445-b571-77d3cbecadd4') dev_2326_incluida,
  bool_and(status='sugerido') continuam_sugeridos FROM atualizados;
