SET LOCAL lock_timeout = '45s';
ALTER TABLE public.extrato_importacoes DROP CONSTRAINT extrato_importacoes_status_check;
ALTER TABLE public.extrato_importacoes ADD CONSTRAINT extrato_importacoes_status_check
  CHECK (status = ANY (ARRAY['processando','concluida','erro','guardado'])) NOT VALID;
COMMENT ON COLUMN public.extrato_importacoes.status IS 'processando | concluida | erro | guardado (arquivo de formato não suportado guardado sem leitura, fonte_tipo=arquivo_nao_lido, zero linhas).';