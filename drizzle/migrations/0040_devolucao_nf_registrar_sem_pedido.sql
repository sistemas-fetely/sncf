-- 03/11/2026 (DEV-NF-VERIFICA-AUTO): devoluções B2C (Shopify) não têm pedido_id; o evento em
-- pedido_eventos (pedido_id NOT NULL) derrubava a marcação 'autorizada'. Evento só quando há pedido.
CREATE OR REPLACE FUNCTION public.fn_devolucao_nf_registrar(p_devolucao_id uuid, p_status text, p_bling_id bigint DEFAULT NULL::bigint, p_numero text DEFAULT NULL::text, p_erro text DEFAULT NULL::text, p_chave text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE d record; v_enc jsonb;
BEGIN
  IF p_status NOT IN ('gerando','rascunho','autorizada','erro') THEN RAISE EXCEPTION 'status invalido %', p_status; END IF;
  SELECT * INTO d FROM devolucao WHERE id = p_devolucao_id FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Devolucao nao encontrada.'; END IF;
  IF p_status = 'gerando' THEN
    IF d.fiscal_acao NOT IN ('nf_devolucao','nota_credito') OR d.fiscal_acao IS NULL THEN RAISE EXCEPTION 'Esta devolucao nao emite NF pelo SNCF (caminho fiscal: %).', coalesce(d.fiscal_acao,'—'); END IF;
    IF d.nf_dev_status IN ('gerando','rascunho','autorizada') THEN
      RAISE EXCEPTION 'NF ja % (Bling %) — nao gerar de novo.', d.nf_dev_status, coalesce(d.nf_dev_numero, d.nf_dev_bling_id::text, '?'); END IF;
  END IF;
  UPDATE devolucao SET nf_dev_status = p_status, nf_dev_bling_id = coalesce(p_bling_id, nf_dev_bling_id),
         nf_dev_numero = coalesce(p_numero, nf_dev_numero), nf_dev_erro = CASE WHEN p_status = 'erro' THEN p_erro END,
         nf_dev_atualizado_em = now(),
         nf_devolucao = CASE WHEN p_status = 'autorizada' THEN coalesce(p_chave, p_numero, nf_dev_numero, nf_devolucao) ELSE nf_devolucao END
   WHERE id = d.id;
  IF p_status = 'autorizada' AND d.finalidade = 'refaturar' THEN
    UPDATE nfs_emitidas SET anulada_por_devolucao_em = coalesce(anulada_por_devolucao_em, now()), updated_at = now()
     WHERE id = d.nf_original_id;
    PERFORM public.fn_refaturar_original_anulada(d.id, 'nf_entrada_autorizada');
  END IF;
  IF p_status = 'autorizada' THEN
    BEGIN v_enc := to_jsonb(public.fn_devolucao_avaliar_encerramento(d.id)); EXCEPTION WHEN OTHERS THEN v_enc := jsonb_build_object('erro', SQLERRM); END;
    IF d.pedido_id IS NOT NULL THEN
      INSERT INTO pedido_eventos (pedido_id, tipo_evento, descricao, metadata, automatico)
      VALUES (d.pedido_id, 'devolucao', d.numero || ' · ' || CASE WHEN d.fiscal_acao='nota_credito' THEN 'Nota de crédito ' ELSE 'NF de devolução ' END || coalesce(p_numero, d.nf_dev_numero, '?') || ' autorizada',
              jsonb_build_object('devolucao_id', d.id, 'bling_id', coalesce(p_bling_id, d.nf_dev_bling_id), 'chave', p_chave, 'fiscal_acao', d.fiscal_acao), true);
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'status', p_status, 'encerramento', v_enc);
END $function$;