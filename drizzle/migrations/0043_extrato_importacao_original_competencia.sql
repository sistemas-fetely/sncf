CREATE POLICY contabil_bancos_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'contabil' AND name LIKE 'bancos/%' AND public.pode_ler_tabela('extrato_importacoes'))
  WITH CHECK (bucket_id = 'contabil' AND name LIKE 'bancos/%' AND public.pode_ler_tabela('extrato_importacoes'));
CREATE POLICY contabil_bancos_delete_super ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'contabil' AND name LIKE 'bancos/%' AND public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.fn_extrato_importacao_mover_original(p_importacao_id uuid, p_novo_path text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_atual text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão expirada — entre novamente'; END IF;
  IF NOT public.pode_ler_tabela('extrato_importacoes') THEN
    RAISE EXCEPTION 'Sem permissão para mover arquivo de importação bancária'; END IF;
  IF p_novo_path IS NULL OR p_novo_path !~ ('^bancos/\d{4}-\d{2}/' || p_importacao_id::text || '/') THEN
    RAISE EXCEPTION 'Caminho inválido: %', p_novo_path; END IF;
  SELECT arquivo_storage_path INTO v_atual FROM extrato_importacoes WHERE id = p_importacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Importação % não encontrada', p_importacao_id; END IF;
  IF v_atual IS NULL THEN RAISE EXCEPTION 'Importação sem arquivo original'; END IF;
  UPDATE extrato_importacoes SET arquivo_storage_path = p_novo_path WHERE id = p_importacao_id;
  RETURN jsonb_build_object('ok', true, 'de', v_atual, 'para', p_novo_path);
END $$;
REVOKE ALL ON FUNCTION public.fn_extrato_importacao_mover_original(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_extrato_importacao_mover_original(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_extrato_importacao_expirar_processando(p_minutos int DEFAULT 30)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  UPDATE extrato_importacoes
     SET status = 'erro',
         erro_detalhe = format('Importação interrompida: ficou em processando por mais de %s min sem concluir (aba fechada ou falha não registrada). Use "Reprocessar do original".', p_minutos)
   WHERE status = 'processando' AND created_at < now() - make_interval(mins => greatest(p_minutos, 10));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.fn_extrato_importacao_expirar_processando(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_extrato_importacao_expirar_processando(int) TO authenticated, service_role;

SELECT cron.schedule('extrato-importacao-expirar-processando', '7 * * * *',
  $c$SELECT public.fn_extrato_importacao_expirar_processando(30);$c$);