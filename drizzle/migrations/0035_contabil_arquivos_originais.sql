ALTER TABLE public.extrato_importacoes
  ADD COLUMN IF NOT EXISTS arquivo_storage_path text,
  ADD COLUMN IF NOT EXISTS arquivo_sha256 text,
  ADD COLUMN IF NOT EXISTS arquivo_bytes bigint,
  ADD COLUMN IF NOT EXISTS arquivo_anexado_em timestamptz,
  ADD COLUMN IF NOT EXISTS arquivo_anexado_por uuid;
CREATE INDEX IF NOT EXISTS extrato_importacoes_sha_idx ON public.extrato_importacoes(arquivo_sha256);

ALTER TABLE public.nfs_emitidas
  ADD COLUMN IF NOT EXISTS xml_storage_path text,
  ADD COLUMN IF NOT EXISTS pdf_storage_path text,
  ADD COLUMN IF NOT EXISTS arquivos_sincronizados_em timestamptz,
  ADD COLUMN IF NOT EXISTS arquivos_erro text;
ALTER TABLE public.nfs_stage
  ADD COLUMN IF NOT EXISTS xml_storage_path text,
  ADD COLUMN IF NOT EXISTS arquivos_sincronizados_em timestamptz;

-- Guarda o original de uma importação: grava só os metadados do arquivo, nunca reprocessa linhas.
CREATE OR REPLACE FUNCTION public.fn_extrato_importacao_anexar_original(
  p_importacao_id uuid, p_storage_path text, p_sha256 text, p_bytes bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_atual text; v_dup uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão expirada — entre novamente'; END IF;
  IF NOT public.pode_ler_tabela('extrato_importacoes') THEN
    RAISE EXCEPTION 'Sem permissão para anexar arquivo de importação bancária';
  END IF;
  IF p_storage_path IS NULL OR p_storage_path NOT LIKE 'bancos/%' THEN
    RAISE EXCEPTION 'Caminho do arquivo inválido: %', p_storage_path;
  END IF;
  IF p_sha256 IS NULL OR length(p_sha256) <> 64 THEN RAISE EXCEPTION 'Hash do arquivo inválido'; END IF;
  SELECT arquivo_storage_path INTO v_atual FROM extrato_importacoes WHERE id = p_importacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Importação % não encontrada', p_importacao_id; END IF;
  IF v_atual IS NOT NULL THEN RAISE EXCEPTION 'Esta importação já tem arquivo original guardado'; END IF;
  SELECT id INTO v_dup FROM extrato_importacoes
   WHERE arquivo_sha256 = p_sha256 AND id <> p_importacao_id LIMIT 1;
  UPDATE extrato_importacoes SET arquivo_storage_path = p_storage_path, arquivo_sha256 = p_sha256,
    arquivo_bytes = p_bytes, arquivo_anexado_em = now(), arquivo_anexado_por = auth.uid()
   WHERE id = p_importacao_id;
  RETURN jsonb_build_object('ok', true, 'mesmo_arquivo_que', v_dup);
END $$;
REVOKE ALL ON FUNCTION public.fn_extrato_importacao_anexar_original(uuid,text,text,bigint) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_extrato_importacao_anexar_original(uuid,text,text,bigint) TO authenticated;

CREATE POLICY contabil_bancos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contabil' AND name LIKE 'bancos/%' AND public.pode_ler_tabela('extrato_importacoes'));
CREATE POLICY contabil_bancos_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'contabil' AND name LIKE 'bancos/%' AND public.pode_ler_tabela('extrato_importacoes'));
CREATE POLICY contabil_pacote_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'contabil' AND public.pode_ler_tabela('remessas_contador'));