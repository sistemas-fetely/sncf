CREATE OR REPLACE FUNCTION public.fn_pi_lote_marcar_registrado(p_lote_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_ant text; v_n int;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'Motivo obrigatório para marcar lote como registrado';
  END IF;
  SELECT estado INTO v_ant FROM pi_import_lote WHERE id = p_lote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote % não encontrado', p_lote_id; END IF;
  UPDATE pi_import_lote
     SET estado = 'registrado',
         observacao = coalesce(observacao,'') || ' | ' || to_char(now(),'DD/MM/YYYY HH24:MI') || ' nascido no FOP: ' || p_motivo,
         atualizado_em = now()
   WHERE id = p_lote_id AND estado IN ('efetivado','efetivado_parcial');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'lote', p_lote_id, 'estado_anterior', v_ant, 'atualizado', v_n > 0);
END $$;
GRANT EXECUTE ON FUNCTION public.fn_pi_lote_marcar_registrado(uuid, text) TO authenticated;

UPDATE pi_import_lote
   SET estado = 'registrado',
       observacao = coalesce(observacao,'') || ' | 04/11/2026 22:12 nascido no FOP via conexão (autorizado por Flavio)',
       atualizado_em = now()
 WHERE id IN ('523f565e-0e2c-45cc-bccf-58e26827ed30','f12d0d04-561c-415b-8503-3eaec296015a',
              'f7f589e0-836e-458b-8440-0a68451ba20e','67efc615-915b-484a-bcad-36907b955c67')
   AND estado = 'efetivado';