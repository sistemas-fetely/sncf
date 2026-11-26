CREATE OR REPLACE FUNCTION public.fn_trg_extrato_dedup_e_pares()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $trg$
DECLARE v_ini date; v_fim date; v_arquivo uuid; v_n integer;
BEGIN
 IF NEW.status<>'concluida' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN IF OLD.status='concluida' THEN RETURN NEW; END IF; END IF;
 SELECT coalesce(NEW.periodo_inicio,min(data_transacao)),coalesce(NEW.periodo_fim,max(data_transacao))
 INTO v_ini,v_fim FROM public.movimentacoes_bancarias WHERE fonte_importacao_id=NEW.id;
 -- CNAB applies title facts, so it normally has no movements carrying the import ID.
 IF (v_ini IS NULL OR v_fim IS NULL) AND NEW.fonte_tipo='retorno_safra' THEN
  SELECT count(*),(array_agg(id))[1] INTO v_n,v_arquivo FROM public.safra_retorno_arquivo WHERE hash_arquivo=NEW.arquivo_sha256;
  IF v_n<>1 THEN
   SELECT count(*),(array_agg(id))[1] INTO v_n,v_arquivo FROM public.safra_retorno_arquivo WHERE arquivo_nome=NEW.nome_arquivo;
  END IF;
  IF v_n<>1 THEN RAISE EXCEPTION 'EXTRATO-DEDUP-E-PAR-TRANSFERENCIA: não foi possível identificar unicamente o retorno CNAB para determinar suas datas'; END IF;
  SELECT coalesce(v_ini,min(dia)),coalesce(v_fim,max(dia)) INTO v_ini,v_fim FROM (
   SELECT coalesce(data_movimento,data_geracao) dia FROM public.safra_retorno_arquivo WHERE id=v_arquivo
   UNION ALL SELECT data_credito FROM public.safra_retorno_ocorrencia WHERE arquivo_id=v_arquivo AND data_credito IS NOT NULL
  ) datas;
  IF v_ini IS NULL OR v_fim IS NULL THEN RAISE EXCEPTION 'EXTRATO-DEDUP-E-PAR-TRANSFERENCIA: retorno CNAB sem datas válidas'; END IF;
 END IF;
 IF v_ini IS NOT NULL AND v_fim IS NOT NULL THEN
  PERFORM public.fn_extrato_dedup_e_pares(NEW.conta_bancaria_id,v_ini-3,v_fim+3);
 END IF;
 RETURN NEW;
END $trg$;
REVOKE ALL ON FUNCTION public.fn_trg_extrato_dedup_e_pares() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_trg_extrato_dedup_e_pares() TO service_role;
REVOKE ALL ON FUNCTION public.fn_extrato_dedup_e_pares(uuid,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_extrato_dedup_e_pares(uuid,date,date) TO service_role;