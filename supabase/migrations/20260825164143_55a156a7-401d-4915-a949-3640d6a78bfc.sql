ALTER TABLE public.declaracao_realidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.declaracao_tipo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.declaracao_motivo ENABLE ROW LEVEL SECURITY;

CREATE POLICY declaracao_realidade_super_admin ON public.declaracao_realidade
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY declaracao_tipo_leitura ON public.declaracao_tipo
  FOR SELECT TO authenticated USING (true);

CREATE POLICY declaracao_tipo_escrita ON public.declaracao_tipo
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY declaracao_motivo_leitura ON public.declaracao_motivo
  FOR SELECT TO authenticated USING (true);

CREATE POLICY declaracao_motivo_escrita ON public.declaracao_motivo
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));