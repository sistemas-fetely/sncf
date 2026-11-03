CREATE OR REPLACE FUNCTION public.fn_remessa_contador_iniciar(p_competencia date, p_destinatarios text[] DEFAULT '{}'::text[], p_observacao text DEFAULT NULL::text, p_limite_parte_mb integer DEFAULT 150)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE f record; v_comp date := date_trunc('month', p_competencia)::date; v_versao int; v_id uuid; v_dest text[]; v_nat text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.pode_ler_tabela('remessas_contador') THEN
    RAISE EXCEPTION 'Sem permissão para gerar o pacote do contador.'; END IF;
  IF p_limite_parte_mb IS NULL OR p_limite_parte_mb < 1 OR p_limite_parte_mb > 150 THEN
    RAISE EXCEPTION 'Limite por parte deve ficar entre 1 e 150 MB (recebido %).', p_limite_parte_mb; END IF;
  SELECT * INTO f FROM contabil_fechamento WHERE competencia = v_comp;
  IF f.id IS NULL THEN RAISE EXCEPTION 'Competência % não existe no fechamento contábil.', to_char(v_comp,'MM/YYYY'); END IF;
  v_nat := CASE f.status WHEN 'fechado' THEN 'definitiva' WHEN 'pre_fechado' THEN 'previa' END;
  IF v_nat IS NULL THEN RAISE EXCEPTION 'Feche ou pré-feche a competência % antes de gerar o pacote (status atual: %).', to_char(v_comp,'MM/YYYY'), f.status; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('remessa_contador_' || v_comp::text));
  IF EXISTS (SELECT 1 FROM remessas_contador WHERE competencia = v_comp AND status = 'gerando') THEN
    RAISE EXCEPTION 'Já existe um pacote de % sendo gerado.', to_char(v_comp,'MM/YYYY'); END IF;
  SELECT coalesce(array_agg(lower(trim(e))), '{}') INTO v_dest FROM unnest(coalesce(p_destinatarios,'{}')) e WHERE trim(e) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
  SELECT coalesce(max(versao),0)+1 INTO v_versao FROM remessas_contador WHERE competencia = v_comp;
  INSERT INTO remessas_contador (tipo, fechamento_id, competencia, versao, status, natureza, progresso, descricao, periodo_inicio, periodo_fim,
    enviada_em, enviada_por, metodo, destinatarios, observacao, gerado_por, gerado_em)
  VALUES ('fechamento_estoque', f.id, v_comp, v_versao, 'gerando', v_nat,
    jsonb_build_object('etapa','iniciado','limite_parte_mb',p_limite_parte_mb,'atualizado_em',now()),
    'Pacote contábil ' || to_char(v_comp,'MM/YYYY') || ' v' || v_versao || CASE WHEN v_nat='previa' THEN ' (prévia)' ELSE '' END,
    v_comp, (v_comp + interval '1 month - 1 day')::date,
    now(), auth.uid(), 'sistema', v_dest, nullif(trim(p_observacao),''), auth.uid(), now())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'remessa_id', v_id, 'versao', v_versao, 'competencia', v_comp, 'natureza', v_nat);
END $function$;