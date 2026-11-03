INSERT INTO public.extrato_fontes (banco, fonte_codigo, nome_documento, formato, papel, destino, implantado, observacao, ordem, ativo)
SELECT 'outro', 'arquivo_nao_lido', 'Arquivo guardado sem leitura', NULL, 'informativa', 'nenhum', true,
       'Formato não suportado: só o original fica guardado (pacote do contador). Zero linhas.', 999, true
WHERE NOT EXISTS (SELECT 1 FROM public.extrato_fontes WHERE fonte_codigo = 'arquivo_nao_lido');

CREATE OR REPLACE FUNCTION public.fn_extrato_importacao_guardar_sem_ler(
  p_importacao_id uuid, p_conta_bancaria_id uuid, p_competencia text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_imp extrato_importacoes%ROWTYPE; v_ini date; v_movs int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão expirada — entre novamente'; END IF;
  IF NOT public.pode_ler_tabela('extrato_importacoes') THEN
    RAISE EXCEPTION 'Sem permissão para guardar arquivo de importação bancária';
  END IF;
  IF p_competencia IS NULL OR p_competencia !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Competência inválida (use AAAA-MM): %', p_competencia;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM contas_bancarias WHERE id = p_conta_bancaria_id) THEN
    RAISE EXCEPTION 'Conta bancária não encontrada';
  END IF;
  SELECT * INTO v_imp FROM extrato_importacoes WHERE id = p_importacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Importação % não encontrada', p_importacao_id; END IF;
  IF v_imp.arquivo_storage_path IS NULL THEN
    RAISE EXCEPTION 'O arquivo original não foi guardado nesta importação — envie o arquivo de novo';
  END IF;
  IF v_imp.status NOT IN ('erro', 'guardado') THEN
    RAISE EXCEPTION 'Só importação com erro de leitura pode virar "guardada sem ler" (status atual: %)', v_imp.status;
  END IF;
  SELECT count(*) INTO v_movs FROM movimentacoes_bancarias WHERE fonte_importacao_id = p_importacao_id;
  IF v_movs > 0 THEN
    RAISE EXCEPTION 'Esta importação já gravou % linha(s) — não pode virar "guardada sem ler"', v_movs;
  END IF;
  v_ini := (p_competencia || '-01')::date;
  UPDATE extrato_importacoes SET
    fonte_tipo = 'arquivo_nao_lido', status = 'guardado', conta_bancaria_id = p_conta_bancaria_id,
    periodo_inicio = v_ini, periodo_fim = (v_ini + interval '1 month - 1 day')::date,
    linhas_lidas = 0, linhas_novas = 0, linhas_enriquecidas = 0, linhas_duplicadas = 0, linhas_ignoradas = 0,
    ignoradas_detalhe = '{}'::jsonb,
    erro_detalhe = 'Formato não suportado — guardado sem ler. Erro original: ' || coalesce(v_imp.erro_detalhe, '—')
  WHERE id = p_importacao_id;
  RETURN jsonb_build_object('ok', true, 'id', p_importacao_id);
END $$;
REVOKE ALL ON FUNCTION public.fn_extrato_importacao_guardar_sem_ler(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_extrato_importacao_guardar_sem_ler(uuid, uuid, text) TO authenticated;