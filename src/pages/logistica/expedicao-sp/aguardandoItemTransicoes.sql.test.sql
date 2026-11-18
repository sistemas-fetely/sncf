-- Run only in the isolated fixture with the live transition definitions loaded.
DO $test$
DECLARE pid uuid := '00000000-0000-0000-0000-000000000001'; rejeitou boolean;
BEGIN
  PERFORM fn_mesa_sp_aguardar_item(pid,'[{"sku":"A","quantidade":1}]','12345');
  rejeitou:=false;
  BEGIN PERFORM fn_mesa_sp_iniciar_conferencia(pid); EXCEPTION WHEN OTHERS THEN rejeitou:=true; END;
  IF NOT rejeitou THEN RAISE EXCEPTION 'Conferência iniciada durante espera'; END IF;
  rejeitou:=false;
  BEGIN PERFORM fn_mesa_sp_registrar_conferencia(pid,'[]',true); EXCEPTION WHEN OTHERS THEN rejeitou:=true; END;
  IF NOT rejeitou THEN RAISE EXCEPTION 'Conferência registrada durante espera'; END IF;
  PERFORM fn_mesa_sp_item_chegou(pid);
  PERFORM fn_mesa_sp_iniciar_conferencia(pid);
  IF (SELECT tipo_evento FROM pedido_eventos ORDER BY criado_em DESC LIMIT 1)<>'mesa_conferencia_iniciada' THEN RAISE EXCEPTION 'Chegada não permitiu conferência'; END IF;
  RAISE NOTICE 'OK: espera bloqueia conferência; chegada permite iniciar conferência';
END $test$;