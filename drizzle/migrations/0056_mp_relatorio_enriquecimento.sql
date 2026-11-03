CREATE TABLE public.mp_relatorio_enriquecimento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_inicio date NOT NULL,
  periodo_fim date NOT NULL,
  status text NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando','processado','erro')),
  mp_report_id bigint,
  file_name text,
  arquivo_storage_path text,
  arquivo_sha256 text,
  arquivo_bytes integer,
  colunas text[],
  tem_external_reference boolean,
  tem_source_id boolean,
  linhas_lidas integer,
  casados integer,
  ganharam_token integer,
  ja_tinham integer,
  sem_token_no_arquivo integer,
  sem_par integer,
  conflitos integer,
  sem_par_detalhe jsonb,
  conflitos_detalhe jsonb,
  movs_antes bigint,
  movs_depois bigint,
  erro text,
  solicitado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (periodo_fim >= periodo_inicio AND periodo_fim - periodo_inicio <= 60)
);
COMMENT ON TABLE public.mp_relatorio_enriquecimento IS 'Fase 2 MP: execuções de enriquecimento de referencia_pedido em liberações já gravadas. Nunca cria lançamento; fora de extrato_importacoes e do Pacote do Contador.';
GRANT SELECT ON public.mp_relatorio_enriquecimento TO authenticated;
GRANT ALL ON public.mp_relatorio_enriquecimento TO service_role;
ALTER TABLE public.mp_relatorio_enriquecimento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver enriquecimento MP" ON public.mp_relatorio_enriquecimento FOR SELECT TO authenticated
  USING (public.usuario_tem_acao('acao.mp_relatorio.reprocessar', auth.uid()));