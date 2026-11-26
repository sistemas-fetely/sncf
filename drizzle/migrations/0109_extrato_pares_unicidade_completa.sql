DO $patch$
DECLARE v_def text; v_old text; v_new text;
BEGIN
 v_def:=pg_get_functiondef('public.fn_extrato_dedup_e_pares(uuid,date,date)'::regprocedure);
 v_old:=E' -- Three extra days include boundary candidates; account restriction is on the edge,\n -- not the candidate set, so reciprocal uniqueness sees every own account.';
 v_new:=E' -- Refuse groups still duplicated in any account before building the full graph.\n SELECT v_skip || coalesce(array_agg(m.id),ARRAY[]::uuid[]) INTO v_skip\n FROM public.movimentacoes_bancarias m JOIN (\n  SELECT conta_bancaria_id,data_transacao,valor,tipo FROM (\n   SELECT conta_bancaria_id,data_transacao,valor,tipo,fonte_importacao_id,count(*) n\n   FROM public.movimentacoes_bancarias WHERE duplicada_de IS NULL\n   GROUP BY 1,2,3,4,5\n  ) sources GROUP BY 1,2,3,4 HAVING sum(n)>max(n)\n ) g ON g.conta_bancaria_id=m.conta_bancaria_id AND g.data_transacao=m.data_transacao AND g.valor=m.valor AND g.tipo=m.tipo\n WHERE m.duplicada_de IS NULL;\n -- Full candidate graph: date/account scope applies only when acting on an edge,\n -- so holidays and out-of-window rivals cannot create false reciprocal uniqueness.';
 IF strpos(v_def,v_old)=0 OR strpos(v_def,E'  AND m.data_transacao BETWEEN v_ini-3 AND v_fim+3\n')=0 THEN RAISE EXCEPTION 'Definição esperada da função não encontrada'; END IF;
 v_def:=replace(v_def,v_old,v_new);
 v_def:=replace(v_def,E'  AND m.data_transacao BETWEEN v_ini-3 AND v_fim+3\n','');
 EXECUTE v_def;
END $patch$;