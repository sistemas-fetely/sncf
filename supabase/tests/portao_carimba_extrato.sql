-- All fixtures and confirmation effects are rolled back, including order events.
BEGIN;
SET LOCAL timezone = 'UTC';
DO $test$
DECLARE
 cliente uuid := gen_random_uuid(); conta uuid := gen_random_uuid();
 pedido uuid := gen_random_uuid(); outro uuid := gen_random_uuid();
 linha uuid := gen_random_uuid(); instrumento uuid := gen_random_uuid();
 comprovante uuid := gen_random_uuid(); mov uuid := gen_random_uuid();
 adto uuid; conflito uuid; adto_conflito uuid; sem_vinculo uuid;
 ref text := 'TESTE-CARIMBO-' || pedido::text;
 antes jsonb; res jsonb; n int; dia date := '2026-10-23';
BEGIN
 INSERT INTO public.parceiros_comerciais(id,razao_social) VALUES(cliente,'Teste portão carimba — ROLLBACK');
 INSERT INTO public.contas_bancarias(id,nome_exibicao,banco,tipo) VALUES(conta,'Teste carimbo — ROLLBACK','Teste','corrente');
 INSERT INTO public.pedidos(id,id_externo,parceiro_id,data_pedido,valor_bruto,valor_liquido,condicao_solicitada,forma_solicitada,estagio)
 VALUES(pedido,ref,cliente,'2026-10-23',1253.79,1253.79,'PIX','pix','pre_separacao'),
       (outro,'TESTE-OUTRO-' || outro::text,cliente,'2026-10-23',1,1,'PIX','pix','pre_separacao');
 INSERT INTO public.provisao_recebimento(id,pedido_id,valor,data_prevista,tipo_pagamento,eh_portao)
 VALUES(linha,pedido,1253.79,dia,'pix',true);
 INSERT INTO public.pedido_portao(id,pedido_id,provisao_id,valor,data_vencimento) VALUES(instrumento,pedido,linha,1253.79,dia);
 INSERT INTO public.comprovante_pagamento(id,pedido_id,storage_path,hash_arquivo,status,sentido,valor_lido,data_lida)
 VALUES(comprovante,pedido,'teste-revertido/nao-existe.pdf',comprovante::text,'lido','entrada',1253.79,dia);
 INSERT INTO public.movimentacoes_bancarias(id,conta_bancaria_id,data_transacao,valor,tipo,descricao,hash_unico,id_transacao_banco)
 VALUES(mov,conta,dia,1253.79,'credito','PIX RECEBIDO TESTE',mov::text,'E-TESTE-' || comprovante::text);
 IF NOT EXISTS(SELECT 1 FROM public.vw_extrato_fila WHERE id=mov) THEN
   RAISE EXCEPTION 'Fixture não entrou na fila de não identificados';
 END IF;

 -- Concrete regression: PED-2375 paid on 2024-10-23 must be rejected.
 BEGIN
   PERFORM public.confirmar_comprovante_pagamento(comprovante,'pix','E-TESTE-' || comprovante::text,1253.79,'2024-10-23');
   RAISE EXCEPTION 'Ano errado foi aceito';
 EXCEPTION WHEN invalid_parameter_value THEN
   IF SQLERRM NOT LIKE '%anterior à data do pedido%' THEN RAISE; END IF;
 END;
 IF (SELECT pago_em FROM public.provisao_recebimento WHERE id=linha) IS NOT NULL THEN RAISE EXCEPTION 'Recusa deixou pagamento parcial'; END IF;

 -- Future payment dates are rejected on the proof route.
 BEGIN
   PERFORM public.confirmar_comprovante_pagamento(comprovante,'pix','E-TESTE-' || comprovante::text,1253.79,CURRENT_DATE+1);
   RAISE EXCEPTION 'Data futura foi aceita';
 EXCEPTION WHEN invalid_parameter_value THEN
   IF SQLERRM NOT LIKE '%não pode ser futura%' THEN RAISE; END IF;
 END;
 -- Direct plan writes share the same date gate.
 BEGIN
   UPDATE public.provisao_recebimento SET pago_em='2024-10-23' WHERE id=linha;
   RAISE EXCEPTION 'Escrita direta aceitou ano errado';
 EXCEPTION WHEN invalid_parameter_value THEN
   IF SQLERRM NOT LIKE '%anterior à data do pedido%' THEN RAISE; END IF;
 END;
 BEGIN
   UPDATE public.provisao_recebimento SET pago_em=(CURRENT_DATE+1)::timestamptz WHERE id=linha;
   RAISE EXCEPTION 'Escrita direta aceitou data futura';
 EXCEPTION WHEN invalid_parameter_value THEN
   IF SQLERRM NOT LIKE '%não pode ser futura%' THEN RAISE; END IF;
 END;

 res := public.confirmar_comprovante_pagamento(comprovante,'pix','E-TESTE-' || comprovante::text,1253.79,dia);
 IF (res->>'ok')::boolean IS DISTINCT FROM true OR (SELECT pago_em::date FROM public.provisao_recebimento WHERE id=linha) IS DISTINCT FROM dia
 THEN RAISE EXCEPTION 'Confirmação válida por comprovante falhou: %',res; END IF;
 SELECT id INTO STRICT adto FROM public.adiantamento_cliente WHERE provisao_id=linha;
 -- Run the real hourly proof matcher; all its effects are rolled back too.
 res := public.fn_conciliar_comprovante_chave(false);
 IF (SELECT movimentacao_origem_id FROM public.adiantamento_cliente WHERE id=adto) IS DISTINCT FROM mov
 THEN RAISE EXCEPTION 'Casamento real por comprovante não criou o vínculo: %',res; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.movimentacoes_bancarias WHERE id=mov AND conciliado AND conciliado_em IS NOT NULL
   AND classe='recebivel_portao_pedido' AND classe_definida_por='match_p3' AND referencia_pedido=ref)
 THEN RAISE EXCEPTION 'Vínculo após comprovante não carimbou os cinco campos'; END IF;
 IF EXISTS(SELECT 1 FROM public.vw_extrato_fila WHERE id=mov) OR EXISTS(SELECT 1 FROM public.vw_conciliacao_orfaos WHERE movimentacao_id=mov)
 THEN RAISE EXCEPTION 'Crédito continua na fila de não identificados'; END IF;
 SELECT to_jsonb(m) INTO antes FROM public.movimentacoes_bancarias m WHERE id=mov;
 UPDATE public.adiantamento_cliente SET movimentacao_origem_id=mov WHERE id=adto;
 IF (SELECT to_jsonb(m) FROM public.movimentacoes_bancarias m WHERE id=mov) IS DISTINCT FROM antes THEN RAISE EXCEPTION 'Reexecução alterou carimbo existente'; END IF;

 -- INSERT with a bank link also stamps immediately.
 INSERT INTO public.movimentacoes_bancarias(conta_bancaria_id,data_transacao,valor,tipo,descricao,hash_unico)
 VALUES(conta,dia,52.31,'credito','TESTE INSERT',gen_random_uuid()::text) RETURNING id INTO sem_vinculo;
 INSERT INTO public.adiantamento_cliente(parceiro_id,pedido_id,origem,valor,saldo,movimentacao_origem_id,recebido_em)
 VALUES(cliente,pedido,'conciliacao',52.31,52.31,sem_vinculo,dia);
 IF NOT EXISTS(SELECT 1 FROM public.movimentacoes_bancarias WHERE id=sem_vinculo AND conciliado AND classe='recebivel_portao_pedido' AND referencia_pedido=ref)
 THEN RAISE EXCEPTION 'INSERT não carimbou'; END IF;
 -- NULL link is a no-op, not a classification of an unrelated bank row.
 INSERT INTO public.adiantamento_cliente(parceiro_id,pedido_id,origem,valor,saldo)
 VALUES(cliente,pedido,'migracao',1,1);

 -- A settled different class is never changed; conflict persists in the order.
 INSERT INTO public.movimentacoes_bancarias(conta_bancaria_id,data_transacao,valor,tipo,descricao,hash_unico,conciliado,conciliado_em,classe,classe_definida_por)
 VALUES(conta,dia,61.32,'credito','TESTE CONFLITO',gen_random_uuid()::text,true,now(),'movimento_interno','manual_p5') RETURNING id INTO conflito;
 SELECT to_jsonb(m) INTO antes FROM public.movimentacoes_bancarias m WHERE id=conflito;
 INSERT INTO public.adiantamento_cliente(parceiro_id,pedido_id,origem,valor,saldo,movimentacao_origem_id)
 VALUES(cliente,pedido,'conciliacao',61.32,61.32,conflito) RETURNING id INTO adto_conflito;
 IF (SELECT to_jsonb(m) FROM public.movimentacoes_bancarias m WHERE id=conflito) IS DISTINCT FROM antes THEN RAISE EXCEPTION 'Conflito sobrescreveu movimentação'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pedido_eventos WHERE pedido_id=pedido AND metadata->>'acao'='portao_carimba_extrato_conflito' AND metadata->>'movimentacao_id'=conflito::text)
 OR (SELECT nivel_prova FROM public.adiantamento_cliente WHERE id=adto_conflito) IS DISTINCT FROM 'divergente'
 THEN RAISE EXCEPTION 'Conflito não ficou explícito e divergente'; END IF;

 -- A link already owned by another order is protected, even with the same class.
 SELECT to_jsonb(m) INTO antes FROM public.movimentacoes_bancarias m WHERE id=mov;
 INSERT INTO public.adiantamento_cliente(parceiro_id,pedido_id,origem,valor,saldo,movimentacao_origem_id)
 VALUES(cliente,outro,'conciliacao',1253.79,1253.79,mov);
 IF (SELECT to_jsonb(m) FROM public.movimentacoes_bancarias m WHERE id=mov) IS DISTINCT FROM antes
 OR NOT EXISTS(SELECT 1 FROM public.pedido_eventos WHERE pedido_id=outro AND metadata->>'acao'='portao_carimba_extrato_conflito')
 THEN RAISE EXCEPTION 'Outro pedido sobrescreveu vínculo existente'; END IF;
 RAISE NOTICE 'PORTAO-CARIMBA-EXTRATO: comprovante, cinco campos, filas, INSERT/UPDATE/NULL/idempotência, conflitos e datas aprovados; tudo será revertido';
END $test$;
ROLLBACK;