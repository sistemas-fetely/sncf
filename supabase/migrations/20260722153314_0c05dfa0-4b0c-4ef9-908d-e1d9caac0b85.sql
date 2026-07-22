GRANT SELECT, INSERT, UPDATE, DELETE ON public.transp_ocorrencia_depara TO authenticated;
GRANT ALL ON public.transp_ocorrencia_depara TO service_role;
CREATE POLICY "auth_all_transp_ocorrencia_depara" ON public.transp_ocorrencia_depara FOR ALL TO authenticated USING (true) WITH CHECK (true);