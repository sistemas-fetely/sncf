REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.contabil_extrato_mensal FROM authenticated,anon;
REVOKE ALL ON public.contabil_extrato_mensal FROM PUBLIC;
GRANT SELECT ON public.contabil_extrato_mensal TO authenticated;
GRANT ALL ON public.contabil_extrato_mensal TO service_role;