CREATE OR REPLACE FUNCTION public.fn_adiantamento_carimbar_extrato()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $function$
DECLARE m public.movimentacoes_bancarias%ROWTYPE; v_ref text; v_conflito text;
BEGIN
 IF NEW.movimentacao_origem_id IS NULL THEN RETURN NEW; END IF;
 SELECT id_externo INTO STRICT v_ref FROM public.pedidos WHERE id=NEW.pedido_id;
 SELECT * INTO STRICT m FROM public.movimentacoes_bancarias WHERE id=NEW.movimentacao_origem_id FOR UPDATE;
 IF m.duplicada_de IS NOT NULL THEN v_conflito := 'movimentação duplicada';
 ELSIF m.classe IS NOT NULL AND m.classe <> 'recebivel_portao_pedido' THEN v_conflito := 'outra classe: ' || m.classe;
 ELSIF nullif(btrim(m.referencia_pedido),'') IS NOT NULL AND m.referencia_pedido <> v_ref THEN v_conflito := 'outro pedido: ' || m.referencia_pedido;
 ELSIF m.conta_pagar_id IS NOT NULL OR m.casada_com_id IS NOT NULL OR m.par_transferencia_id IS NOT NULL THEN v_conflito := 'outro vínculo financeiro';
 ELSIF EXISTS(SELECT 1 FROM public.adiantamento_cliente a WHERE a.movimentacao_origem_id=m.id AND a.pedido_id<>NEW.pedido_id)
 OR EXISTS(SELECT 1 FROM public.titulo_a_receber t WHERE t.movimentacao_baixa_id=m.id)
 OR EXISTS(SELECT 1 FROM public.haver_cliente h WHERE h.movimentacao_origem_id=m.id)
 OR EXISTS(SELECT 1 FROM public.conta_cliente_lancamento l WHERE l.movimentacao_id=m.id)
 OR EXISTS(SELECT 1 FROM public.titulo_movimentacao_rateio l WHERE l.movimentacao_id=m.id)
 OR EXISTS(SELECT 1 FROM public.pagamento_alocacao l WHERE l.movimentacao_bancaria_id=m.id)
 OR EXISTS(SELECT 1 FROM public.contas_pagar_receber l WHERE l.movimentacao_bancaria_id=m.id)
 OR EXISTS(SELECT 1 FROM public.despesas l WHERE l.movimentacao_bancaria_id=m.id)
 OR EXISTS(SELECT 1 FROM public.safrapay_liquidacao l WHERE l.movimentacao_id=m.id)
 OR EXISTS(SELECT 1 FROM public.devolucao l WHERE l.ressarcimento_mov_id=m.id)
 OR EXISTS(SELECT 1 FROM public.venda_fora_liquidacao_mov l WHERE l.movimentacao_id=m.id) THEN v_conflito := 'movimentação vinculada a outro recebimento ou obrigação';
 ELSIF coalesce(m.conciliado,false) AND m.classe IS NULL AND nullif(btrim(m.referencia_pedido),'') IS NULL THEN v_conflito := 'movimentação já conciliada sem identificação compatível';
 END IF;
 IF v_conflito IS NOT NULL THEN
   INSERT INTO public.pedido_eventos(pedido_id,tipo_evento,descricao,metadata,operador_id,automatico)
   VALUES(NEW.pedido_id,'alterado',format('Conflito ao carimbar extrato do pedido %s: %s. Pagamento mantido; extrato não sobrescrito; conferir vínculo.',v_ref,v_conflito),
    jsonb_build_object('acao','portao_carimba_extrato_conflito','adiantamento_id',NEW.id,'movimentacao_id',m.id,'motivo',v_conflito,'classe_existente',m.classe,'referencia_existente',m.referencia_pedido),auth.uid(),auth.uid() IS NULL);
   -- An exception would roll back the alert and the payment fact. Persist an explicit
   -- divergent proof + order event and emit a warning instead of silently succeeding.
   UPDATE public.adiantamento_cliente SET nivel_prova='divergente' WHERE id=NEW.id AND nivel_prova IS DISTINCT FROM 'divergente';
   RAISE WARNING 'PORTAO-CARIMBA-EXTRATO: pedido %, movimentação %: %; conferir evento do pedido',v_ref,m.id,v_conflito;
   RETURN NEW;
 END IF;
 IF coalesce(m.conciliado,false) AND m.conciliado_em IS NOT NULL AND m.classe='recebivel_portao_pedido' AND m.classe_definida_por='match_p3' AND m.referencia_pedido=v_ref THEN RETURN NEW; END IF;
 UPDATE public.movimentacoes_bancarias SET conciliado=true,conciliado_em=now(),classe='recebivel_portao_pedido',classe_definida_por='match_p3',referencia_pedido=v_ref WHERE id=m.id;
 RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.fn_adiantamento_carimbar_extrato() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_adiantamento_carimba_extrato AFTER INSERT OR UPDATE OF movimentacao_origem_id ON public.adiantamento_cliente FOR EACH ROW EXECUTE FUNCTION public.fn_adiantamento_carimbar_extrato();

CREATE OR REPLACE FUNCTION public.fn_portao_validar_data_pagamento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog SET timezone='UTC' AS $function$
DECLARE v_data date; v_pedido date;
BEGIN
 IF TG_TABLE_NAME='provisao_recebimento' THEN
   IF NEW.pago_em IS NULL THEN RETURN NEW; END IF;
   IF TG_OP='UPDATE' AND NEW.pago_em IS NOT DISTINCT FROM OLD.pago_em AND NEW.pedido_id IS NOT DISTINCT FROM OLD.pedido_id THEN RETURN NEW; END IF;
   v_data:=NEW.pago_em::date;
 ELSE
   IF NEW.status <> 'confirmado' OR NEW.pedido_id IS NULL THEN RETURN NEW; END IF;
   IF TG_OP='UPDATE' AND OLD.status='confirmado' AND NEW.data_lida IS NOT DISTINCT FROM OLD.data_lida AND NEW.pedido_id IS NOT DISTINCT FROM OLD.pedido_id THEN RETURN NEW; END IF;
   v_data:=NEW.data_lida;
 END IF;
 SELECT data_pedido INTO STRICT v_pedido FROM public.pedidos WHERE id=NEW.pedido_id;
 IF v_data IS NULL THEN RAISE EXCEPTION 'Informe a data do pagamento.' USING ERRCODE='22023'; END IF;
 IF v_data < v_pedido THEN RAISE EXCEPTION 'Data do pagamento (%) não pode ser anterior à data do pedido (%).',to_char(v_data,'DD/MM/YYYY'),to_char(v_pedido,'DD/MM/YYYY') USING ERRCODE='22023'; END IF;
 IF v_data > CURRENT_DATE THEN RAISE EXCEPTION 'Data do pagamento (%) não pode ser futura.',to_char(v_data,'DD/MM/YYYY') USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.fn_portao_validar_data_pagamento() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_provisao_validar_data_pagamento BEFORE INSERT OR UPDATE OF pago_em,pedido_id ON public.provisao_recebimento FOR EACH ROW EXECUTE FUNCTION public.fn_portao_validar_data_pagamento();
CREATE TRIGGER trg_comprovante_validar_data_pagamento BEFORE INSERT OR UPDATE OF status,data_lida,pedido_id ON public.comprovante_pagamento FOR EACH ROW EXECUTE FUNCTION public.fn_portao_validar_data_pagamento();

-- Remove only redundant ledger writes: the advance trigger now owns the stamp.
-- In data-modifying CTEs a second update of the same row is not deterministic.
DO $patch$
DECLARE v_def text; v_old text; v_sig text;
BEGIN
 FOREACH v_sig IN ARRAY ARRAY['public.fn_conciliar_comprovante_chave(boolean)','public.fn_conciliar_comprovante_documento(boolean)'] LOOP
  SELECT pg_get_functiondef(v_sig::regprocedure) INTO v_def;
  v_old := substring(v_def FROM '\), upd_mov AS \([\s\S]*?\), upd_c AS \(');
  IF v_old IS NULL OR (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 THEN RAISE EXCEPTION 'Bloco upd_mov não encontrado uma única vez em %',v_sig; END IF;
  EXECUTE replace(v_def,v_old,'), upd_c AS (');
 END LOOP;
 v_sig:='public.fn_portao_conciliar_automatico(boolean,date)';
 SELECT pg_get_functiondef(v_sig::regprocedure) INTO v_def;
 v_old:=substring(v_def FROM '      UPDATE movimentacoes_bancarias[\s\S]*?WHERE id = r.mov_id;');
 IF v_old IS NULL OR (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 THEN RAISE EXCEPTION 'Carimbo legado não encontrado em %',v_sig; END IF;
 EXECUTE replace(v_def,v_old,'      -- Carimbo e conflitos pertencem a trg_adiantamento_carimba_extrato.');
 v_sig:='public.fn_conciliar_recebimento_agrupado(boolean,integer,numeric)';
 SELECT pg_get_functiondef(v_sig::regprocedure) INTO v_def;
 v_old:=substring(v_def FROM '          UPDATE movimentacoes_bancarias SET classe[\s\S]*?WHERE id = v_mov.id;');
 IF v_old IS NULL OR (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 THEN RAISE EXCEPTION 'Carimbo legado não encontrado em %',v_sig; END IF;
 EXECUTE replace(v_def,v_old,'          -- Carimbo e conflitos pertencem a trg_adiantamento_carimba_extrato.');
END $patch$;