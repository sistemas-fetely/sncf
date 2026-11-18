-- Run only in an isolated PostgreSQL fixture (never the hosted database).
DO $test$
DECLARE pid uuid := '00000000-0000-0000-0000-000000000001'; r jsonb; antes numeric; rejeitou boolean; m jsonb;
BEGIN
  SELECT reservado INTO antes FROM vw_estoque_centro WHERE sku='A';
  BEGIN
    PERFORM fn_mesa_sp_aguardar_item(pid,'[{"sku":"A","quantidade":1}]','1234');
    RAISE EXCEPTION 'Motivo de 4 caracteres foi aceito';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%5 caracteres%' THEN RAISE; END IF; END;
  r := fn_mesa_sp_aguardar_item(pid,'[{"sku":"A","quantidade":10},{"sku":"B","quantidade":2}]','12345');
  IF r->>'etapa'<>'aguardando_item' THEN RAISE EXCEPTION 'Etapa errada'; END IF;
  IF (SELECT estagio FROM pedidos WHERE id=pid)<>'em_separacao' THEN RAISE EXCEPTION 'Estágio alterado'; END IF;
  IF (SELECT reservado FROM vw_estoque_centro WHERE sku='A')<>antes THEN RAISE EXCEPTION 'Reserva alterada'; END IF;
  SELECT metadata INTO m FROM pedido_eventos WHERE pedido_id=pid AND tipo_evento='mesa_aguardando_item' ORDER BY criado_em DESC LIMIT 1;
  IF m->>'etapa_origem'<>'separacao' OR (m->'itens'->0->>'fisico_no_cd_no_registro')::numeric<>20 THEN RAISE EXCEPTION 'Registro físico/origem errado'; END IF;
  IF (SELECT item_pode_ter_chegado FROM vw_mesa_sp_quadro WHERE pedido_id=pid) THEN RAISE EXCEPTION 'Saldo igual não pode avisar'; END IF;
  UPDATE stock_fixture SET fisico_sadio=21 WHERE sku='A';
  IF (SELECT item_pode_ter_chegado FROM vw_mesa_sp_quadro WHERE pedido_id=pid) THEN RAISE EXCEPTION 'Subiu só um item: aviso indevido'; END IF;
  UPDATE stock_fixture SET fisico_sadio=6 WHERE sku='B';
  IF NOT (SELECT item_pode_ter_chegado FROM vw_mesa_sp_quadro WHERE pedido_id=pid) THEN RAISE EXCEPTION 'Todos subiram: aviso ausente'; END IF;
  PERFORM fn_mesa_sp_item_chegou(pid,NULL);
  IF (SELECT etapa FROM vw_mesa_sp_quadro WHERE pedido_id=pid)<>'separacao' THEN RAISE EXCEPTION 'Não voltou à separação'; END IF;
  IF (SELECT metadata->'itens' FROM pedido_eventos WHERE tipo_evento='mesa_item_chegou' ORDER BY criado_em DESC LIMIT 1) IS DISTINCT FROM m->'itens' THEN RAISE EXCEPTION 'Itens não preservados'; END IF;
  PERFORM fn_mesa_sp_aguardar_item(pid,'[{"sku":"A","quantidade":1}]','12345');
  IF (SELECT item_pode_ter_chegado FROM vw_mesa_sp_quadro WHERE pedido_id=pid) THEN RAISE EXCEPTION 'Novo registro não reiniciou saldo'; END IF;
  PERFORM fn_mesa_sp_item_chegou(pid,'Confirmação manual');
  -- Manual confirmation is valid even when the stock hint is false.
  IF (SELECT etapa FROM vw_mesa_sp_quadro WHERE pedido_id=pid)<>'separacao' THEN RAISE EXCEPTION 'Confirmação manual recusada'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements('[[],[{"sku":"A","quantidade":0}],[{"sku":"A","quantidade":11}],[{"sku":"FORA","quantidade":1}],[{"sku":"A","quantidade":1},{"sku":"A","quantidade":1}]]') LOOP
    rejeitou:=false;
    BEGIN PERFORM fn_mesa_sp_aguardar_item(pid,r,'12345'); EXCEPTION WHEN OTHERS THEN rejeitou:=true; END;
    IF NOT rejeitou THEN RAISE EXCEPTION 'Itens inválidos aceitos: %',r; END IF;
  END LOOP;
  UPDATE pedidos SET estagio='aguardando_estoque' WHERE id=pid;
  rejeitou:=false;
  BEGIN PERFORM fn_mesa_sp_aguardar_item(pid,'[{"sku":"A","quantidade":1}]','12345'); EXCEPTION WHEN OTHERS THEN rejeitou:=true; END;
  IF NOT rejeitou THEN RAISE EXCEPTION 'Estágio pré-Mesa aceito'; END IF;
  UPDATE pedidos SET estagio='em_separacao' WHERE id=pid;
  INSERT INTO pedido_eventos(pedido_id,tipo_evento) VALUES(pid,'mesa_conferencia_iniciada');
  PERFORM fn_mesa_sp_aguardar_item(pid,'[{"sku":"A","quantidade":1}]','12345');
  IF (SELECT metadata->>'etapa_origem' FROM pedido_eventos WHERE tipo_evento='mesa_aguardando_item' ORDER BY criado_em DESC LIMIT 1)<>'conferencia' THEN RAISE EXCEPTION 'Origem conferência perdida'; END IF;
  PERFORM fn_mesa_sp_item_chegou(pid);
  rejeitou:=false;
  BEGIN PERFORM fn_mesa_sp_item_chegou(pid); EXCEPTION WHEN OTHERS THEN rejeitou:=true; END;
  IF NOT rejeitou THEN RAISE EXCEPTION 'Confirmação duplicada aceita'; END IF;
  PERFORM set_config('test.permitido','false',true);
  rejeitou:=false;
  BEGIN PERFORM fn_mesa_sp_aguardar_item(pid,'[{"sku":"A","quantidade":1}]','12345'); EXCEPTION WHEN insufficient_privilege THEN rejeitou:=true; END;
  IF NOT rejeitou THEN RAISE EXCEPTION 'Operador sem permissão aceito'; END IF;
  PERFORM set_config('test.permitido','true',true);
  PERFORM set_config('test.cancelamento','true',true);
  rejeitou:=false;
  BEGIN PERFORM fn_mesa_sp_aguardar_item(pid,'[{"sku":"A","quantidade":1}]','12345'); EXCEPTION WHEN OTHERS THEN rejeitou:=true; END;
  IF NOT rejeitou THEN RAISE EXCEPTION 'Cancelamento ignorado'; END IF;
  RAISE NOTICE 'OK: motivo 5, itens/quantidades/SKUs, estágio/reservas, dois saldos, confirmação manual, origens, repetição, permissão e cancelamento';
END $test$;