-- The installed SQL function is tested with isolated accounts; no fixture survives.
BEGIN;
DO $test$
DECLARE
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
 s1 uuid:=gen_random_uuid(); s2 uuid:=gen_random_uuid(); ids uuid[];
 d uuid; cr uuid; r jsonb; before_client jsonb; n integer; imp uuid:=gen_random_uuid();
 ar record; di date; df date; imp_cnab uuid:=gen_random_uuid(); imp_invalido uuid:=gen_random_uuid();
BEGIN
 SELECT to_jsonb(m) INTO before_client FROM public.movimentacoes_bancarias m
 WHERE id='46964f0b-a039-413e-a16e-8e44546f787a';
 INSERT INTO public.contas_bancarias(id,nome_exibicao,banco,tipo)
 VALUES(a,'Teste dedup A','Teste','corrente'),(b,'Teste dedup B','Teste','corrente'),(c,'Teste dedup C','Teste','corrente');

 -- Two real same-value PIX per source: four imports preserve exactly two.
 INSERT INTO public.movimentacoes_bancarias(conta_bancaria_id,data_transacao,valor,tipo,descricao,origem,hash_unico,fonte_importacao_id,classe,contraparte_nome,created_at)
 VALUES(a,'2090-09-09',2000,'credito','PIX RECEBIDO','ofx',gen_random_uuid()::text,s1,NULL,NULL,'2090-01-01'),
       (a,'2090-09-09',2000,'credito','PIX RECEBIDO','ofx',gen_random_uuid()::text,s1,NULL,NULL,'2090-01-02'),
       (a,'2090-09-09',2000,'credito','PIX RECEBIDO FETELY','ofx',gen_random_uuid()::text,s2,'transferencia_interna','FETELY','2090-01-03'),
       (a,'2090-09-09',2000,'credito','PIX RECEBIDO OUTRO','ofx',gen_random_uuid()::text,s2,NULL,'OUTRO','2090-01-04');
 r:=public.fn_extrato_dedup_e_pares(a,'2090-09-09','2090-09-09');
 SELECT count(*) INTO n FROM public.movimentacoes_bancarias WHERE conta_bancaria_id=a AND valor=2000 AND duplicada_de IS NULL;
 IF n<>2 OR jsonb_array_length(r->'duplicadas')<>2 THEN RAISE EXCEPTION 'Maior multiplicidade do arquivo não preservada: %',r; END IF;
 IF EXISTS(SELECT 1 FROM public.movimentacoes_bancarias WHERE conta_bancaria_id=a AND valor=2000 AND contraparte_nome IS NOT NULL AND duplicada_de IS NOT NULL)
 THEN RAISE EXCEPTION 'Prioridade de classe/contraparte não preservada'; END IF;

 -- Settled survivor wins over a richer and older import.
 INSERT INTO public.movimentacoes_bancarias(conta_bancaria_id,data_transacao,valor,tipo,descricao,origem,hash_unico,fonte_importacao_id,conciliado,contraparte_nome,created_at)
 VALUES(a,'2090-09-10',3356.90,'credito','PIX RECEBIDO','ofx',gen_random_uuid()::text,s1,true,NULL,'2090-01-04') RETURNING id INTO cr;
 INSERT INTO public.movimentacoes_bancarias(conta_bancaria_id,data_transacao,valor,tipo,descricao,origem,hash_unico,fonte_importacao_id,contraparte_nome,created_at)
 VALUES(a,'2090-09-10',3356.90,'credito','PIX RECEBIDO FETELY','ofx',gen_random_uuid()::text,s2,'FETELY','2090-01-01') RETURNING id INTO d;
 r:=public.fn_extrato_dedup_e_pares(a,'2090-09-10','2090-09-10');
 IF (SELECT duplicada_de FROM public.movimentacoes_bancarias WHERE id=d) IS DISTINCT FROM cr THEN RAISE EXCEPTION 'Conciliação não teve prioridade'; END IF;

 -- Both copies linked/settled: review, never conceal a financial fact.
 INSERT INTO public.movimentacoes_bancarias(conta_bancaria_id,data_transacao,valor,tipo,descricao,origem,hash_unico,fonte_importacao_id,conciliado)
 VALUES(a,'2090-09-11',2965.09,'credito','PIX RECEBIDO','ofx',gen_random_uuid()::text,s1,true),
       (a,'2090-09-11',2965.09,'credito','PIX RECEBIDO','ofx',gen_random_uuid()::text,s2,true);
 r:=public.fn_extrato_dedup_e_pares(a,'2090-09-11','2090-09-11');
 IF jsonb_array_length(r->'revisao')<>1 OR EXISTS(SELECT 1 FROM public.movimentacoes_bancarias WHERE conta_bancaria_id=a AND valor=2965.09 AND duplicada_de IS NOT NULL)
 THEN RAISE EXCEPTION 'Grupo com conciliação excedente não foi preservado'; END IF;

 -- Unique own-account debit/credit, including an already-classified transfer.
 INSERT INTO public.movimentacoes_bancarias(conta_bancaria_id,data_transacao,valor,tipo,descricao,origem,hash_unico,classe,classe_definida_por)
 VALUES(a,'2090-10-01',-3672.13,'debito','MP SAQUE','ofx',gen_random_uuid()::text,'transferencia_interna','regra_p1') RETURNING id INTO d;
 INSERT INTO public.movimentacoes_bancarias(conta_bancaria_id,data_transacao,valor,tipo,descricao,origem,hash_unico)
 VALUES(b,'2090-10-01',3672.13,'credito','PIX RECEBIDO','ofx',gen_random_uuid()::text) RETURNING id INTO cr;
 r:=public.fn_extrato_dedup_e_pares(a,'2090-10-01','2090-10-01');
 IF jsonb_array_length(r->'pares')<>1 OR NOT EXISTS(SELECT 1 FROM public.movimentacoes_bancarias x JOIN public.movimentacoes_bancarias y ON y.id=x.par_transferencia_id
 WHERE x.id=d AND y.id=cr AND y.par_transferencia_id=d AND x.conciliado AND y.conciliado AND x.classe='transferencia_interna' AND y.classe='transferencia_interna')
 THEN RAISE EXCEPTION 'Par único não ficou cruzado e conciliado'; END IF;
 r:=public.fn_extrato_dedup_e_pares(a,'2090-10-01','2090-10-01');
 IF jsonb_array_length(r->'pares')<>0 OR jsonb_array_length(r->'duplicadas')<>0 THEN RAISE EXCEPTION 'Reexecução não é idempotente'; END IF;

 -- One debit with two credits in different accounts stays ambiguous on both sides.
 INSERT INTO public.movimentacoes_bancarias(conta_bancaria_id,data_transacao,valor,tipo,descricao,origem,hash_unico)
 VALUES(a,'2090-10-03',-5000,'debito','PIX ENVIADO','ofx',gen_random_uuid()::text),
       (b,'2090-10-03',5000,'credito','PIX RECEBIDO','ofx',gen_random_uuid()::text),
       (c,'2090-10-03',5000,'credito','PIX RECEBIDO','ofx',gen_random_uuid()::text);
 r:=public.fn_extrato_dedup_e_pares(a,'2090-10-03','2090-10-03');
 IF jsonb_array_length(r->'pares')<>0 OR jsonb_array_length(r->'revisao')<>2 THEN RAISE EXCEPTION 'Ambiguidade foi casada: %',r; END IF;

 -- Manual differing class is a suggestion; order-bound movements are ineligible.
 INSERT INTO public.movimentacoes_bancarias(conta_bancaria_id,data_transacao,valor,tipo,descricao,origem,hash_unico,classe,classe_definida_por)
 VALUES(a,'2090-10-04',-800,'debito','TED ENVIADA','ofx',gen_random_uuid()::text,'movimento_interno','manual_p5') RETURNING id INTO d;
 INSERT INTO public.movimentacoes_bancarias(conta_bancaria_id,data_transacao,valor,tipo,descricao,origem,hash_unico)
 VALUES(b,'2090-10-04',800,'credito','PIX RECEBIDO','ofx',gen_random_uuid()::text);
 r:=public.fn_extrato_dedup_e_pares(a,'2090-10-04','2090-10-04');
 IF jsonb_array_length(r->'pares')<>0 OR jsonb_array_length(r->'revisao')<>1 OR (SELECT classe FROM public.movimentacoes_bancarias WHERE id=d)<>'movimento_interno'
 THEN RAISE EXCEPTION 'Classificação manual sobrescrita'; END IF;
 INSERT INTO public.movimentacoes_bancarias(conta_bancaria_id,data_transacao,valor,tipo,descricao,origem,hash_unico,referencia_pedido)
 VALUES(a,'2090-10-05',-1234,'debito','PIX ENVIADO','ofx',gen_random_uuid()::text,'PED-TESTE');
 INSERT INTO public.movimentacoes_bancarias(conta_bancaria_id,data_transacao,valor,tipo,descricao,origem,hash_unico)
 VALUES(b,'2090-10-05',1234,'credito','PIX RECEBIDO','ofx',gen_random_uuid()::text);
 r:=public.fn_extrato_dedup_e_pares(a,'2090-10-05','2090-10-05');
 IF jsonb_array_length(r->'pares')<>0 THEN RAISE EXCEPTION 'Movimentação com pedido foi casada'; END IF;

 -- Same-account TED returned exactly three days later.
 INSERT INTO public.movimentacoes_bancarias(conta_bancaria_id,data_transacao,valor,tipo,descricao,origem,hash_unico)
 VALUES(a,'2090-10-10',-800,'debito','TED ENVIADA OUTRA TIT','ofx',gen_random_uuid()::text) RETURNING id INTO d;
 INSERT INTO public.movimentacoes_bancarias(conta_bancaria_id,data_transacao,valor,tipo,descricao,origem,hash_unico)
 VALUES(a,'2090-10-13',800,'credito','DEVOLUÇÃO DE TED','ofx',gen_random_uuid()::text) RETURNING id INTO cr;
 r:=public.fn_extrato_dedup_e_pares(a,'2090-10-13','2090-10-13');
 IF jsonb_array_length(r->'ted_devolvida')<>1 OR NOT EXISTS(SELECT 1 FROM public.movimentacoes_bancarias WHERE id=cr AND par_transferencia_id=d AND classe='movimento_interno' AND conciliado)
 THEN RAISE EXCEPTION 'TED devolvida D-3 não casada'; END IF;
 IF (SELECT to_jsonb(m) FROM public.movimentacoes_bancarias m WHERE id='46964f0b-a039-413e-a16e-8e44546f787a') IS DISTINCT FROM before_client
 THEN RAISE EXCEPTION 'PIX cliente protegido foi alterado'; END IF;
 -- Reciprocal uniqueness: two debits and a single credit also cannot match.
 INSERT INTO public.movimentacoes_bancarias(conta_bancaria_id,data_transacao,valor,tipo,descricao,origem,hash_unico)
 VALUES(a,'2090-10-15',-7000,'debito','PIX ENVIADO','ofx',gen_random_uuid()::text),
       (c,'2090-10-15',-7000,'debito','PIX ENVIADO','ofx',gen_random_uuid()::text),
       (b,'2090-10-15',7000,'credito','PIX RECEBIDO','ofx',gen_random_uuid()::text);
 r:=public.fn_extrato_dedup_e_pares(a,'2090-10-15','2090-10-15');
 IF jsonb_array_length(r->'pares')<>0 OR jsonb_array_length(r->'revisao')<>1 THEN RAISE EXCEPTION 'Unicidade do lado do crédito ignorada'; END IF;

 -- Friday to Monday is one working day; Tuesday is outside the window.
 INSERT INTO public.movimentacoes_bancarias(conta_bancaria_id,data_transacao,valor,tipo,descricao,origem,hash_unico)
 VALUES(a,'2090-10-20',-1001,'debito','PIX ENVIADO','ofx',gen_random_uuid()::text),
       (b,'2090-10-23',1001,'credito','PIX RECEBIDO','ofx',gen_random_uuid()::text),
       (a,'2090-10-20',-1002,'debito','PIX ENVIADO','ofx',gen_random_uuid()::text),
       (b,'2090-10-24',1002,'credito','PIX RECEBIDO','ofx',gen_random_uuid()::text);
 r:=public.fn_extrato_dedup_e_pares(a,'2090-10-20','2090-10-20');
 IF jsonb_array_length(r->'pares')<>1 THEN RAISE EXCEPTION 'Limite de um dia útil incorreto'; END IF;

 -- A holiday and a competing debit outside the action scope stay ambiguous.
 INSERT INTO public.feriado_nacional(data,descricao)
 SELECT '2090-10-23'::date,'Feriado de teste revertido' WHERE NOT EXISTS(SELECT 1 FROM public.feriado_nacional WHERE data='2090-10-23');
 INSERT INTO public.movimentacoes_bancarias(conta_bancaria_id,data_transacao,valor,tipo,descricao,origem,hash_unico)
 VALUES(a,'2090-10-20',-1003,'debito','PIX ENVIADO','ofx',gen_random_uuid()::text),
       (c,'2090-10-23',-1003,'debito','PIX ENVIADO','ofx',gen_random_uuid()::text),
       (b,'2090-10-24',1003,'credito','PIX RECEBIDO','ofx',gen_random_uuid()::text);
 r:=public.fn_extrato_dedup_e_pares(a,'2090-10-20','2090-10-20');
 IF EXISTS(SELECT 1 FROM public.movimentacoes_bancarias WHERE conta_bancaria_id=a AND abs(valor)=1003 AND par_transferencia_id IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'revisao') x WHERE (x->>'candidatos_credito')::int=2)
 THEN RAISE EXCEPTION 'Grafo completo não preservou concorrente após feriado'; END IF;

 -- An unresolved duplicate group in the other account must not create a pair.
 INSERT INTO public.movimentacoes_bancarias(conta_bancaria_id,data_transacao,valor,tipo,descricao,origem,hash_unico,fonte_importacao_id)
 VALUES(a,'2090-10-28',-1004,'debito','PIX ENVIADO','ofx',gen_random_uuid()::text,s1),
       (b,'2090-10-28',1004,'credito','PIX RECEBIDO','ofx',gen_random_uuid()::text,s1),
       (b,'2090-10-28',1004,'credito','PIX RECEBIDO','ofx',gen_random_uuid()::text,s2);
 r:=public.fn_extrato_dedup_e_pares(a,'2090-10-28','2090-10-28');
 IF jsonb_array_length(r->'pares')<>0 THEN RAISE EXCEPTION 'Casamento antes de resolver duplicidade na outra conta'; END IF;

 -- A CNAB completion without explicit period derives its dates from imported rows.
 INSERT INTO public.extrato_importacoes(id,conta_bancaria_id,fonte_tipo,nome_arquivo,status)
 VALUES(imp,a,'retorno_safra','teste-revertido.txt','processando');
 INSERT INTO public.movimentacoes_bancarias(conta_bancaria_id,data_transacao,valor,tipo,descricao,origem,hash_unico,fonte_importacao_id)
 VALUES(a,'2090-11-01',-1005,'debito','PIX ENVIADO','ofx',gen_random_uuid()::text,imp) RETURNING id INTO d;
 INSERT INTO public.movimentacoes_bancarias(conta_bancaria_id,data_transacao,valor,tipo,descricao,origem,hash_unico)
 VALUES(b,'2090-11-01',1005,'credito','PIX RECEBIDO','ofx',gen_random_uuid()::text) RETURNING id INTO cr;
 IF (SELECT par_transferencia_id FROM public.movimentacoes_bancarias WHERE id=d) IS NOT NULL THEN RAISE EXCEPTION 'Casou antes do fim do arquivo'; END IF;
 UPDATE public.extrato_importacoes SET status='concluida' WHERE id=imp;
 IF (SELECT par_transferencia_id FROM public.movimentacoes_bancarias WHERE id=d) IS DISTINCT FROM cr
 OR NOT EXISTS(SELECT 1 FROM public.extrato_dedup_pares_execucao WHERE conta_id=a AND data_ini='2090-10-29' AND data_fim='2090-11-04')
 THEN RAISE EXCEPTION 'Finalização da importação não chamou a janela ±3'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.extrato_dedup_pares_execucao e, jsonb_array_elements(e.resultado->'alteracoes') x
 WHERE x->>'id'=d::text AND x->'antes'->>'par_transferencia_id' IS NULL AND x->'depois'->>'par_transferencia_id'=cr::text)
 THEN RAISE EXCEPTION 'Auditoria antes/depois ausente'; END IF;
 -- Real CNAB shape: no imported movements carry the import ID and no period exists.
 SELECT * INTO ar FROM public.safra_retorno_arquivo
 WHERE coalesce(data_movimento,data_geracao) IS NOT NULL
 AND hash_arquivo IS NOT NULL ORDER BY created_at DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Precisa de um retorno real para testar fechamento CNAB'; END IF;
 SELECT min(dia),max(dia) INTO di,df FROM (
 SELECT coalesce(ar.data_movimento,ar.data_geracao) dia
 UNION ALL SELECT data_credito FROM public.safra_retorno_ocorrencia WHERE arquivo_id=ar.id AND data_credito IS NOT NULL) datas;
 INSERT INTO public.extrato_importacoes(id,conta_bancaria_id,fonte_tipo,nome_arquivo,status,arquivo_sha256)
 VALUES(imp_cnab,a,'retorno_safra',ar.arquivo_nome,'processando',ar.hash_arquivo);
 UPDATE public.extrato_importacoes SET status='concluida' WHERE id=imp_cnab;
 IF NOT EXISTS(SELECT 1 FROM public.extrato_dedup_pares_execucao WHERE conta_id=a AND data_ini=di-3 AND data_fim=df+3)
 THEN RAISE EXCEPTION 'CNAB sem movimentos/período não chamou a regra nas datas do arquivo'; END IF;
 INSERT INTO public.extrato_importacoes(id,conta_bancaria_id,fonte_tipo,nome_arquivo,status)
 VALUES(imp_invalido,a,'retorno_safra',gen_random_uuid()::text||'.txt','processando');
 BEGIN
  UPDATE public.extrato_importacoes SET status='concluida' WHERE id=imp_invalido;
  RAISE EXCEPTION 'CNAB sem identidade passou silenciosamente';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'EXTRATO-DEDUP-E-PAR-TRANSFERENCIA:%' THEN RAISE; END IF;
 END;
 IF (SELECT status FROM public.extrato_importacoes WHERE id=imp_invalido)<>'processando'
 THEN RAISE EXCEPTION 'Falha do fechamento não foi atômica'; END IF;
 RAISE NOTICE 'Regras transacionais aprovadas; todas as alterações serão revertidas';
END $test$;
ROLLBACK;