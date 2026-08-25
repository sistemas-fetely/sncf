DROP POLICY IF EXISTS declaracao_realidade_super_admin ON public.declaracao_realidade;

CREATE POLICY declaracao_realidade_acao_nomeada ON public.declaracao_realidade
  FOR ALL TO authenticated
  USING (public.usuario_tem_acao('acao.declarar_realidade', auth.uid()))
  WITH CHECK (public.usuario_tem_acao('acao.declarar_realidade', auth.uid()));