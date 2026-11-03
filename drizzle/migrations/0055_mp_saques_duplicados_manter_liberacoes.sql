DO $$
DECLARE r record; v_motivo text := 'Saque gravado duas vezes (liberações × retiradas): mantém a cópia de mp_release; a de mp_withdraw fica como duplicada (decisão Flávio 03/11/2026).';
BEGIN
  FOR r IN SELECT w.id wid, l.id lid, w.duplicada_de wdup, l.duplicada_de ldup
    FROM movimentacoes_bancarias w JOIN movimentacoes_bancarias l
      ON l.conta_bancaria_id = w.conta_bancaria_id AND l.id_transacao_banco = w.id_transacao_banco AND l.valor = w.valor AND l.origem = 'mp_release'
    WHERE w.origem = 'mp_withdraw' AND w.id IN ('e3c1dd5f-9847-4545-abd3-0e1de89da148','c1dbfe38-e7b4-440d-8808-8e54bba75805','4724eefa-7d65-408e-8d09-e3388cdc075a')
  LOOP
    IF EXISTS (SELECT 1 FROM movimentacoes_bancarias WHERE id = r.wid AND (conciliado OR conta_pagar_id IS NOT NULL))
       OR EXISTS (SELECT 1 FROM titulo_a_receber WHERE movimentacao_baixa_id = r.wid)
       OR EXISTS (SELECT 1 FROM contas_pagar_receber WHERE movimentacao_bancaria_id = r.wid) THEN
      RAISE EXCEPTION 'Cópia de retiradas % tem conciliação/título vinculado — não alterar', r.wid;
    END IF;
    UPDATE movimentacoes_bancarias SET duplicada_de = r.lid WHERE id = r.wid AND duplicada_de IS DISTINCT FROM r.lid;
    UPDATE movimentacoes_bancarias SET duplicada_de = NULL WHERE id = r.lid AND duplicada_de IS NOT NULL;
    INSERT INTO audit_log(acao, tabela, registro_id, dados_antes, dados_depois, justificativa)
    VALUES ('marcar_duplicada', 'movimentacoes_bancarias', r.wid::text,
      jsonb_build_object('withdraw_duplicada_de', r.wdup, 'release_id', r.lid, 'release_duplicada_de', r.ldup),
      jsonb_build_object('withdraw_duplicada_de', r.lid, 'release_id', r.lid, 'release_duplicada_de', null), v_motivo);
  END LOOP;
END $$;