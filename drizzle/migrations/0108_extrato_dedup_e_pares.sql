CREATE TABLE public.backup_mov_dedup_pares_20261126 (LIKE public.movimentacoes_bancarias);
GRANT ALL ON public.backup_mov_dedup_pares_20261126 TO service_role;
REVOKE ALL ON public.backup_mov_dedup_pares_20261126 FROM anon, authenticated;
ALTER TABLE public.backup_mov_dedup_pares_20261126 ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX ux_backup_mov_dedup_pares_20261126 ON public.backup_mov_dedup_pares_20261126(id);
CREATE TABLE public.extrato_dedup_pares_execucao (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), criado_em timestamptz NOT NULL DEFAULT now(),
 conta_id uuid, data_ini date NOT NULL, data_fim date NOT NULL,
 regra text NOT NULL DEFAULT 'EXTRATO-DEDUP-E-PAR-TRANSFERENCIA',
 resultado jsonb NOT NULL
);
GRANT ALL ON public.extrato_dedup_pares_execucao TO service_role;
REVOKE ALL ON public.extrato_dedup_pares_execucao FROM anon, authenticated;
ALTER TABLE public.extrato_dedup_pares_execucao ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.fn_extrato_dedup_e_pares(p_conta_id uuid DEFAULT NULL, p_data_ini date DEFAULT NULL, p_data_fim date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
 v_ini date; v_fim date; g record; r record; v_ids uuid[]; v_keep uuid[];
 v_skip uuid[] := ARRAY[]::uuid[]; v_k integer; v_i integer;
 v_dups jsonb := '[]'; v_pares jsonb := '[]'; v_ted jsonb := '[]'; v_revisao jsonb := '[]';
 v_changes jsonb := '[]'; v_antes jsonb; v_result jsonb; v_exec uuid := gen_random_uuid();
 v_regra constant text := 'EXTRATO-DEDUP-E-PAR-TRANSFERENCIA';
 v_excluido constant uuid := '46964f0b-a039-413e-a16e-8e44546f787a';
BEGIN
 -- A single ledger lock keeps ranking, candidate degrees and crossed writes atomic.
 PERFORM pg_advisory_xact_lock(hashtextextended(v_regra, 0));
 LOCK TABLE public.movimentacoes_bancarias IN SHARE ROW EXCLUSIVE MODE;
 SELECT coalesce(p_data_ini,min(data_transacao)),coalesce(p_data_fim,max(data_transacao))
 INTO v_ini,v_fim FROM public.movimentacoes_bancarias WHERE p_conta_id IS NULL OR conta_bancaria_id=p_conta_id;
 IF v_ini IS NULL OR v_fim IS NULL THEN RETURN jsonb_build_object('duplicadas','[]'::jsonb,'pares','[]'::jsonb,'ted_devolvida','[]'::jsonb,'revisao','[]'::jsonb); END IF;
 IF v_ini>v_fim THEN RAISE EXCEPTION 'Janela de datas inválida'; END IF;
 CREATE TEMP TABLE IF NOT EXISTS extrato_dp_protegidos (id uuid PRIMARY KEY) ON COMMIT DROP;
 DELETE FROM pg_temp.extrato_dp_protegidos WHERE true;
 INSERT INTO pg_temp.extrato_dp_protegidos
 SELECT id FROM public.movimentacoes_bancarias WHERE conta_pagar_id IS NOT NULL OR nullif(btrim(referencia_pedido),'') IS NOT NULL OR casada_com_id IS NOT NULL
 UNION SELECT movimentacao_baixa_id FROM public.titulo_a_receber WHERE movimentacao_baixa_id IS NOT NULL
 UNION SELECT movimentacao_bancaria_id FROM public.contas_pagar_receber WHERE movimentacao_bancaria_id IS NOT NULL
 UNION SELECT movimentacao_bancaria_id FROM public.despesas WHERE movimentacao_bancaria_id IS NOT NULL
 UNION SELECT movimentacao_bancaria_id FROM public.pagamento_alocacao WHERE movimentacao_bancaria_id IS NOT NULL
 UNION SELECT movimentacao_origem_id FROM public.haver_cliente WHERE movimentacao_origem_id IS NOT NULL
 UNION SELECT movimentacao_origem_id FROM public.adiantamento_cliente WHERE movimentacao_origem_id IS NOT NULL
 UNION SELECT movimentacao_id FROM public.conta_cliente_lancamento WHERE movimentacao_id IS NOT NULL
 UNION SELECT movimentacao_id FROM public.titulo_movimentacao_rateio WHERE movimentacao_id IS NOT NULL
 UNION SELECT ressarcimento_mov_id FROM public.devolucao WHERE ressarcimento_mov_id IS NOT NULL
 UNION SELECT movimentacao_id FROM public.venda_fora_liquidacao_mov WHERE movimentacao_id IS NOT NULL;
 -- Entire date/value groups are ranked; no paginated or source-local partial decision.
 FOR g IN
  SELECT conta_bancaria_id,data_transacao,valor,tipo,count(*) n
  FROM public.movimentacoes_bancarias
  WHERE duplicada_de IS NULL AND data_transacao BETWEEN v_ini AND v_fim
   AND (p_conta_id IS NULL OR conta_bancaria_id=p_conta_id)
  GROUP BY 1,2,3,4 HAVING count(*)>1
 LOOP
  SELECT max(n) INTO v_k FROM (
   SELECT count(*) n FROM public.movimentacoes_bancarias
   WHERE duplicada_de IS NULL AND conta_bancaria_id=g.conta_bancaria_id
    AND data_transacao=g.data_transacao AND valor=g.valor AND tipo=g.tipo
   GROUP BY fonte_importacao_id) s;
  IF v_k=g.n THEN CONTINUE; END IF;
  SELECT array_agg(m.id ORDER BY
   (coalesce(m.conciliado,false) OR m.par_transferencia_id IS NOT NULL OR p.id IS NOT NULL OR EXISTS(SELECT 1 FROM public.movimentacoes_bancarias x WHERE x.par_transferencia_id=m.id OR x.casada_com_id=m.id)) DESC,
   (m.classe IS NOT NULL) DESC,
   (nullif(btrim(m.contraparte_nome),'') IS NOT NULL OR nullif(btrim(m.contraparte_documento),'') IS NOT NULL) DESC,
   m.created_at ASC NULLS LAST,m.id)
  INTO v_ids FROM public.movimentacoes_bancarias m LEFT JOIN pg_temp.extrato_dp_protegidos p ON p.id=m.id
  WHERE m.duplicada_de IS NULL AND m.conta_bancaria_id=g.conta_bancaria_id
   AND m.data_transacao=g.data_transacao AND m.valor=g.valor AND m.tipo=g.tipo;
  v_keep := v_ids[1:v_k];
  -- Never hide a linked/settled extra, even if another survivor also has a link.
  IF v_excluido=ANY(v_ids) OR EXISTS(
   SELECT 1 FROM public.movimentacoes_bancarias m LEFT JOIN pg_temp.extrato_dp_protegidos p ON p.id=m.id
   WHERE m.id=ANY(v_ids[v_k+1:array_length(v_ids,1)])
    AND (coalesce(m.conciliado,false) OR m.par_transferencia_id IS NOT NULL OR p.id IS NOT NULL OR EXISTS(SELECT 1 FROM public.movimentacoes_bancarias x WHERE x.par_transferencia_id=m.id OR x.casada_com_id=m.id))) THEN
   v_skip:=v_skip||v_ids;
   v_revisao:=v_revisao||jsonb_build_array(jsonb_build_object('tipo','grupo_duplicado','motivo','vínculo/conciliação nas excedentes ou PIX cliente protegido','ids',v_ids,'conta_id',g.conta_bancaria_id,'data',g.data_transacao,'valor',g.valor,'quantidade_real',v_k));
   CONTINUE;
  END IF;
  FOR v_i IN v_k+1..array_length(v_ids,1) LOOP
   SELECT to_jsonb(m) INTO v_antes FROM public.movimentacoes_bancarias m WHERE id=v_ids[v_i];
   UPDATE public.movimentacoes_bancarias SET duplicada_de=v_keep[1+((v_i-v_k-1)%v_k)],
    classe_nota=concat_ws(E'\n',nullif(classe_nota,''),v_regra||': duplicata entre arquivos; sobrevivente '||v_keep[1+((v_i-v_k-1)%v_k)]::text)
   WHERE id=v_ids[v_i];
   v_dups:=v_dups||jsonb_build_array(jsonb_build_object('id',v_ids[v_i],'sobrevivente',v_keep[1+((v_i-v_k-1)%v_k)],'conta_id',g.conta_bancaria_id,'valor',g.valor));
   v_changes:=v_changes||jsonb_build_array(jsonb_build_object('id',v_ids[v_i],'antes',v_antes,'depois',(SELECT to_jsonb(m) FROM public.movimentacoes_bancarias m WHERE id=v_ids[v_i])));
  END LOOP;
 END LOOP;
 CREATE TEMP TABLE IF NOT EXISTS extrato_dp_linhas (
 id uuid PRIMARY KEY, conta_id uuid, dia date, proximo_util date, valor numeric,
 tipo text, descricao text, classe text, definida_por text
 ) ON COMMIT DROP;
 DELETE FROM pg_temp.extrato_dp_linhas WHERE true;
 -- Three extra days include boundary candidates; account restriction is on the edge,
 -- not the candidate set, so reciprocal uniqueness sees every own account.
 INSERT INTO pg_temp.extrato_dp_linhas
 SELECT m.id,m.conta_bancaria_id,m.data_transacao,
  (SELECT d::date FROM generate_series(m.data_transacao+1,m.data_transacao+15,interval '1 day') d
   WHERE extract(isodow FROM d)<6 AND NOT EXISTS(SELECT 1 FROM public.feriado_nacional f WHERE f.data=d::date) ORDER BY d LIMIT 1),
  abs(m.valor),m.tipo,upper(translate(coalesce(m.descricao,''),'áàãâéêíóôõúüçÁÀÃÂÉÊÍÓÔÕÚÜÇ','aaaaeeiooouucAAAAEEIOOOUUC')),m.classe,m.classe_definida_por
 FROM public.movimentacoes_bancarias m JOIN public.contas_bancarias c ON c.id=m.conta_bancaria_id
 WHERE m.duplicada_de IS NULL AND m.par_transferencia_id IS NULL
  AND m.data_transacao BETWEEN v_ini-3 AND v_fim+3
  AND m.id<>v_excluido AND NOT(m.id=ANY(v_skip))
  AND NOT EXISTS(SELECT 1 FROM pg_temp.extrato_dp_protegidos p WHERE p.id=m.id);
 CREATE TEMP TABLE IF NOT EXISTS extrato_dp_candidatos (
 tipo text, debito uuid, credito uuid, alvo text, bloqueado boolean,
 PRIMARY KEY(tipo,debito,credito)
 ) ON COMMIT DROP;
 DELETE FROM pg_temp.extrato_dp_candidatos WHERE true;
 -- Reserve return candidates before own-account matching, including ambiguous returns.
 INSERT INTO pg_temp.extrato_dp_candidatos
 SELECT 'ted_devolvida',d.id,c.id,'movimento_interno',
  (d.definida_por IS NOT NULL AND d.classe IS DISTINCT FROM 'movimento_interno') OR
  (c.definida_por IS NOT NULL AND c.classe IS DISTINCT FROM 'movimento_interno')
 FROM pg_temp.extrato_dp_linhas d JOIN pg_temp.extrato_dp_linhas c ON
  d.tipo='debito' AND c.tipo='credito' AND d.conta_id=c.conta_id AND d.valor=c.valor
  AND d.dia BETWEEN c.dia-3 AND c.dia
 WHERE c.descricao ~ '(DEVOL|ESTORN)' AND c.descricao ~ '(TED|PIX)'
  AND d.descricao ~ '(TED|PIX)' AND d.descricao ~ '(ENVI|PAG|TRANSF|EMIT)';
 INSERT INTO pg_temp.extrato_dp_candidatos
 SELECT 'transferencia',d.id,c.id,'transferencia_interna',
  (d.definida_por IS NOT NULL AND d.classe IS DISTINCT FROM 'transferencia_interna') OR
  (c.definida_por IS NOT NULL AND c.classe IS DISTINCT FROM 'transferencia_interna')
 FROM pg_temp.extrato_dp_linhas d JOIN pg_temp.extrato_dp_linhas c ON
  d.tipo='debito' AND c.tipo='credito' AND d.conta_id<>c.conta_id AND d.valor=c.valor
  AND c.dia BETWEEN d.dia AND d.proximo_util
 WHERE NOT(c.descricao ~ '(DEVOL|ESTORN)' AND c.descricao ~ '(TED|PIX)')
  AND NOT EXISTS(SELECT 1 FROM pg_temp.extrato_dp_candidatos x WHERE x.tipo='ted_devolvida' AND (x.debito IN(d.id,c.id) OR x.credito IN(d.id,c.id)));
 -- Degrees are frozen before any match: do not greedily turn an ambiguous graph unique.
 FOR r IN
  SELECT x.*,count(*) OVER(PARTITION BY debito) nd,count(*) OVER(PARTITION BY credito) nc
  FROM pg_temp.extrato_dp_candidatos x
  ORDER BY x.tipo,x.debito,x.credito
 LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_temp.extrato_dp_linhas l WHERE l.id IN(r.debito,r.credito)
   AND l.dia BETWEEN v_ini AND v_fim AND (p_conta_id IS NULL OR l.conta_id=p_conta_id)) THEN CONTINUE; END IF;
  IF r.nd<>1 OR r.nc<>1 OR r.bloqueado THEN
   v_revisao:=v_revisao||jsonb_build_array(jsonb_build_object('tipo',r.tipo,'motivo',CASE WHEN r.bloqueado THEN 'classe definida preservada' ELSE 'mais de um candidato em pelo menos um lado' END,'debito_id',r.debito,'credito_id',r.credito,'candidatos_debito',r.nd,'candidatos_credito',r.nc));
   CONTINUE;
  END IF;
  FOR v_i IN 1..2 LOOP
   SELECT to_jsonb(m) INTO v_antes FROM public.movimentacoes_bancarias m WHERE id=CASE WHEN v_i=1 THEN r.debito ELSE r.credito END;
   UPDATE public.movimentacoes_bancarias SET
    par_transferencia_id=CASE WHEN v_i=1 THEN r.credito ELSE r.debito END,
    classe=r.alvo,classe_definida_por=coalesce(classe_definida_por,'par_p2'),
    conciliado=true,conciliado_em=coalesce(conciliado_em,now()),
    classe_nota=concat_ws(E'\n',nullif(classe_nota,''),v_regra||': '||r.tipo||'; par '||CASE WHEN v_i=1 THEN r.credito ELSE r.debito END::text)
   WHERE id=CASE WHEN v_i=1 THEN r.debito ELSE r.credito END;
   v_changes:=v_changes||jsonb_build_array(jsonb_build_object('id',v_antes->>'id','antes',v_antes,'depois',(SELECT to_jsonb(m) FROM public.movimentacoes_bancarias m WHERE id=(v_antes->>'id')::uuid)));
  END LOOP;
  IF r.tipo='transferencia' THEN v_pares:=v_pares||jsonb_build_array(jsonb_build_object('debito_id',r.debito,'credito_id',r.credito));
  ELSE v_ted:=v_ted||jsonb_build_array(jsonb_build_object('debito_id',r.debito,'credito_id',r.credito)); END IF;
 END LOOP;
 v_result:=jsonb_build_object('execucao_id',v_exec,'duplicadas',v_dups,'pares',v_pares,'ted_devolvida',v_ted,'revisao',v_revisao,'alteracoes',v_changes);
 INSERT INTO public.extrato_dedup_pares_execucao(id,conta_id,data_ini,data_fim,resultado) VALUES(v_exec,p_conta_id,v_ini,v_fim,v_result);
 RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION public.fn_extrato_dedup_e_pares(uuid,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_extrato_dedup_e_pares(uuid,date,date) TO service_role;
CREATE OR REPLACE FUNCTION public.fn_trg_extrato_dedup_e_pares()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $trg$
DECLARE v_ini date; v_fim date;
BEGIN
 -- Only after the complete file; no per-movement matching and no swallowed errors.
 IF NEW.status<>'concluida' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN IF OLD.status='concluida' THEN RETURN NEW; END IF; END IF;
 SELECT coalesce(NEW.periodo_inicio,min(data_transacao)),coalesce(NEW.periodo_fim,max(data_transacao))
 INTO v_ini,v_fim FROM public.movimentacoes_bancarias WHERE fonte_importacao_id=NEW.id;
 IF v_ini IS NOT NULL AND v_fim IS NOT NULL THEN
  PERFORM public.fn_extrato_dedup_e_pares(NEW.conta_bancaria_id,v_ini-3,v_fim+3);
 END IF;
 RETURN NEW;
END $trg$;
REVOKE ALL ON FUNCTION public.fn_trg_extrato_dedup_e_pares() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_trg_extrato_dedup_e_pares() TO service_role;
CREATE TRIGGER trg_extrato_dedup_e_pares AFTER INSERT OR UPDATE OF status ON public.extrato_importacoes
FOR EACH ROW EXECUTE FUNCTION public.fn_trg_extrato_dedup_e_pares();