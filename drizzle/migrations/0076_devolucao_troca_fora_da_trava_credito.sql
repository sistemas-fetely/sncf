DO $migration$
DECLARE
  v_atual text;
  v_nova text;
BEGIN
  v_atual := pg_get_functiondef('public.registrar_devolucao_parcial(uuid,numeric,text,text,text,uuid,date,text,jsonb,text)'::regprocedure);
  IF (length(v_atual) - length(replace(v_atual, 'IF p_desfecho IN (''haver'',''reembolso'',''troca'') THEN', ''))) / length('IF p_desfecho IN (''haver'',''reembolso'',''troca'') THEN') <> 1 THEN
    RAISE EXCEPTION 'Trava de crédito na criação diferente da definição esperada; nenhuma alteração aplicada.';
  END IF;
  v_nova := replace(v_atual, 'IF p_desfecho IN (''haver'',''reembolso'',''troca'') THEN', 'IF p_desfecho IN (''haver'',''reembolso'') THEN');
  EXECUTE v_nova;

  v_atual := pg_get_functiondef('public.decidir_desfecho_devolucao(uuid,text,text,uuid,date)'::regprocedure);
  IF (length(v_atual) - length(replace(v_atual, 'if p_desfecho in (''haver'',''reembolso'',''troca'') and d.canal = ''b2b''', ''))) / length('if p_desfecho in (''haver'',''reembolso'',''troca'') and d.canal = ''b2b''') <> 1 THEN
    RAISE EXCEPTION 'Trava de crédito na decisão diferente da definição esperada; nenhuma alteração aplicada.';
  END IF;
  v_nova := replace(v_atual, 'if p_desfecho in (''haver'',''reembolso'',''troca'') and d.canal = ''b2b''', 'if p_desfecho in (''haver'',''reembolso'') and d.canal = ''b2b''');
  EXECUTE v_nova;
END
$migration$;