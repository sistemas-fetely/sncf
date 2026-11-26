DO $patch$
DECLARE v_def text; v_old text;
BEGIN
 v_def:=pg_get_functiondef('public.fn_extrato_dedup_e_pares(uuid,date,date)'::regprocedure);
 v_old:=' ) g ON g.conta_bancaria_id=m.conta_bancaria_id AND g.data_transacao=m.data_transacao AND g.valor=m.valor AND g.tipo=m.tipo';
 IF strpos(v_def,v_old)=0 THEN RAISE EXCEPTION 'Trecho esperado não encontrado'; END IF;
 EXECUTE replace(v_def,v_old,' ) pendente ON pendente.conta_bancaria_id=m.conta_bancaria_id AND pendente.data_transacao=m.data_transacao AND pendente.valor=m.valor AND pendente.tipo=m.tipo');
END $patch$;