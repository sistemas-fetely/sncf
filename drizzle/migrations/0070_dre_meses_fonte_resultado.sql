CREATE OR REPLACE VIEW public.vw_dre_meses WITH (security_invoker=true) AS SELECT DISTINCT mes FROM public.vw_dre_mensal;
GRANT SELECT ON public.vw_dre_meses TO authenticated,service_role;
COMMENT ON VIEW public.vw_dre_meses IS 'Meses do resultado para o seletor da DRE, derivados da mesma fonte da tela.';