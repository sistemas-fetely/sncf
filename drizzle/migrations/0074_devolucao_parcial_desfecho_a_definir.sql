CREATE OR REPLACE FUNCTION public.registrar_devolucao_parcial(p_pedido_id uuid, p_valor numeric, p_nf_devolucao text DEFAULT NULL::text, p_motivo text DEFAULT NULL::text, p_desfecho text DEFAULT 'haver'::text, p_titulo_abater uuid DEFAULT NULL::uuid, p_nova_data date DEFAULT NULL::date, p_motivo_codigo text DEFAULT NULL::text, p_itens jsonb DEFAULT NULL::jsonb, p_fiscal_acao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_operador uuid; v_pedido record; v_total_titulos numeric;
  v_haver_id uuid; v_dias int; v_reembolso jsonb;
  v_t record; v_titulo_numero text; v_saldo numeric; v_novo numeric; v_data date;
  v_reemissao jsonb; v_abate jsonb;
  v_dev_id uuid; v_dev_numero text; v_itens int := 0;
  v_nf record; v_valor_fiscal numeric := 0; v_item jsonb; v_nfi jsonb; v_mov int := 0; v_b2b jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT usuario_tem_acao('acao.pedido_devolver') THEN
    RAISE EXCEPTION 'Sem permissao (acao.pedido_devolver).  Concessao e feita no Console de Acesso.';
  END IF;
  v_operador := auth.uid();

  IF p_desfecho NOT IN ('haver','troca','reembolso','abater_divida','nenhum') THEN
    RAISE EXCEPTION 'Desfecho inválido: % (use haver, troca, reembolso, abater_divida ou nenhum = a definir)', p_desfecho;
  END IF;
  IF p_fiscal_acao IS NOT NULL AND p_fiscal_acao NOT IN ('nf_devolucao','nota_credito') THEN
    RAISE EXCEPTION 'Caminho fiscal inválido: % (use nf_devolucao ou nota_credito)', p_fiscal_acao;
  END IF;
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo da devolução parcial obrigatório (mínimo 5 caracteres)';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'Valor devolvido deve ser maior que zero';
  END IF;
  IF p_motivo_codigo IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.parametros WHERE categoria='devolucao_motivo' AND valor=p_motivo_codigo AND ativo) THEN
    RAISE EXCEPTION 'Motivo de devolução inválido ou inativo: %', p_motivo_codigo;
  END IF;

  SELECT id, estagio, parceiro_id, id_externo INTO v_pedido
  FROM public.pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado: %', p_pedido_id; END IF;
  IF v_pedido.estagio NOT IN ('faturado','em_transporte','entregue') THEN
    RAISE EXCEPTION 'Devolução exige NF emitida (faturado/em_transporte/entregue). Estágio atual: %', v_pedido.estagio;
  END IF;

  -- 04/11/2026 CREDITO-SO-SOBRE-O-PAGO na CRIACAO (caso DEV-2374): antes so existia em decidir_desfecho_devolucao.
  IF p_desfecho IN ('haver','reembolso') THEN
    v_b2b := public.fn_devolucao_haver_disponivel_b2b(p_pedido_id);
    IF (v_b2b->>'aberto')::numeric > 0 THEN
      RAISE EXCEPTION 'O pedido % tem R$ % em aberto. Devolução sobre dívida em aberto é ABATER DÍVIDA (escolha a parcela) — crédito ou reembolso só sobre o que já foi pago.', v_pedido.id_externo, to_char((v_b2b->>'aberto')::numeric,'FM999G999D00');
    END IF;
    IF p_valor > (v_b2b->>'disponivel')::numeric + 0.01 THEN
      RAISE EXCEPTION 'Crédito/reembolso só sobre o que foi pago: pago R$ %, já creditado R$ %, disponível R$ %.', v_b2b->>'pago', v_b2b->>'ja_creditado', v_b2b->>'disponivel';
    END IF;
  END IF;

  -- NF original do pedido (última autorizada de saída)
  SELECT id, numero, chave_acesso, itens_json INTO v_nf
  FROM public.nfs_emitidas
  WHERE pedido_venda_id = p_pedido_id AND tipo = 'saida' AND situacao = 'autorizada'
  ORDER BY emitida_em DESC NULLS LAST, created_at DESC LIMIT 1;

  -- ITENS (nota de crédito = o que faltou · NF de devolução = o que volta): obrigatórios, quantidades ≤ NF, valor = soma dos itens pela NF = valor financeiro
  IF p_fiscal_acao IN ('nota_credito','nf_devolucao') THEN
    IF v_nf.id IS NULL THEN RAISE EXCEPTION 'Caminho fiscal % exige NF de saída autorizada no pedido %.', p_fiscal_acao, v_pedido.id_externo; END IF;
    IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
      RAISE EXCEPTION '%', CASE WHEN p_fiscal_acao = 'nota_credito' THEN 'Nota de crédito exige os itens e quantidades que faltaram.' ELSE 'NF de devolução exige os itens e quantidades que estão voltando.' END;
    END IF;
    FOR v_item IN SELECT x FROM jsonb_array_elements(p_itens) x LOOP
      SELECT e INTO v_nfi FROM jsonb_array_elements(coalesce(v_nf.itens_json,'[]'::jsonb)) e WHERE e->>'codigo' = v_item->>'sku' LIMIT 1;
      IF v_nfi IS NULL THEN RAISE EXCEPTION 'SKU % não está na NF %.', v_item->>'sku', v_nf.numero; END IF;
      IF (v_item->>'quantidade')::numeric <= 0 OR (v_item->>'quantidade')::numeric > (v_nfi->>'quantidade')::numeric THEN
        RAISE EXCEPTION 'Quantidade de % inválida (% na NF %).', v_item->>'sku', v_nfi->>'quantidade', v_nf.numero;
      END IF;
      v_valor_fiscal := v_valor_fiscal + round((v_item->>'quantidade')::numeric * (v_nfi->>'valor')::numeric, 2);
    END LOOP;
    IF abs(v_valor_fiscal - p_valor) > 0.05 THEN
      RAISE EXCEPTION 'Valor devolvido (R$ %) difere do valor dos itens pela NF (R$ %). Documento fiscal e financeiro têm de fechar no mesmo valor.',
        to_char(p_valor,'FM999G999D00'), to_char(v_valor_fiscal,'FM999G999D00');
    END IF;
  END IF;

  SELECT coalesce(sum(coalesce(valor_atual, valor_bruto)),0) INTO v_total_titulos
  FROM public.titulo_a_receber WHERE pedido_id = p_pedido_id AND status NOT IN ('cancelado','devolvido');
  IF v_total_titulos > 0 AND p_valor > v_total_titulos THEN
    RAISE EXCEPTION 'Valor devolvido (R$ %) maior que o total do pedido (R$ %). Para devolução total use registrar_devolucao_pedido.',
      to_char(p_valor,'FM999G999D00'), to_char(v_total_titulos,'FM999G999D00');
  END IF;

  IF p_desfecho = 'abater_divida' THEN
    IF p_titulo_abater IS NULL THEN RAISE EXCEPTION 'Informe a parcela (título) da qual o valor será abatido.'; END IF;
    SELECT id, numero_titulo, status, boleto_status, conta_id, coalesce(valor_atual, valor_bruto) AS saldo, data_vencimento_atual
    INTO v_t FROM public.titulo_a_receber WHERE id = p_titulo_abater AND pedido_id = p_pedido_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Parcela não encontrada neste pedido.'; END IF;
    v_titulo_numero := v_t.numero_titulo;
    IF v_t.status = 'pago' THEN
      RAISE EXCEPTION 'Parcela % já está paga — não há dívida para abater (use haver, troca ou reembolso).', v_t.numero_titulo;
    END IF;
    IF v_t.status IN ('cancelado','cancelado_recuperacao','devolvido','baixado_por_perda') THEN
      RAISE EXCEPTION 'Parcela % está encerrada (status %).', v_t.numero_titulo, v_t.status;
    END IF;
    v_saldo := v_t.saldo;
    IF p_valor >= v_saldo THEN
      RAISE EXCEPTION 'Valor a abater (R$ %) zera ou excede a parcela % (R$ %). Escolha outra parcela ou use haver/reembolso.',
        to_char(p_valor,'FM999G999D00'), v_t.numero_titulo, to_char(v_saldo,'FM999G999D00');
    END IF;
    v_novo := v_saldo - p_valor;
    IF v_t.boleto_status IS NULL OR v_t.boleto_status = 'pendente' THEN
      UPDATE public.titulo_a_receber SET valor_desconto = valor_desconto + p_valor, updated_at = now() WHERE id = v_t.id;
      UPDATE public.contas_pagar_receber SET valor = v_novo, updated_at = now()
      WHERE id = v_t.conta_id AND status NOT IN ('pago','conciliado','cancelado');
      v_abate := jsonb_build_object('modo','desconto_aplicado_direto','aplicado_agora',true,'novo_valor',v_novo);
    ELSIF v_t.boleto_status IN ('registrado','vencido','rejeitado') THEN
      v_data := coalesce(p_nova_data, v_t.data_vencimento_atual);
      IF v_data <= CURRENT_DATE THEN
        RAISE EXCEPTION 'O vencimento da parcela % já passou (%). Informe uma nova data futura para o boleto reemitido.',
          v_t.numero_titulo, to_char(v_t.data_vencimento_atual,'DD/MM/YYYY');
      END IF;
      v_reemissao := public.solicitar_reemissao_boleto(v_t.id, v_data, v_novo, 'Abatimento de devolução parcial: '||p_motivo);
      v_abate := jsonb_build_object('modo','baixa_e_reemissao','aplicado_agora',false,'novo_valor',v_novo,'nova_data',v_data,'reemissao',v_reemissao);
    ELSE
      RAISE EXCEPTION 'Boleto da parcela % está em "%" — aguarde a conclusão antes de abater.', v_t.numero_titulo, v_t.boleto_status;
    END IF;
  ELSIF p_desfecho IN ('haver','troca','reembolso') THEN
    SELECT NULLIF(valor,'')::int INTO v_dias FROM public.parametros WHERE categoria='dias_validade_haver' AND ativo=true LIMIT 1;
    IF v_dias IS NULL THEN v_dias := 180; END IF;
    INSERT INTO public.haver_cliente (parceiro_id, valor, saldo, status, origem_pedido_id, origem_descricao, data_expiracao, motivo, created_by)
    VALUES (v_pedido.parceiro_id, p_valor, p_valor, 'disponivel', p_pedido_id,
       'Devolução parcial do pedido '||COALESCE(v_pedido.id_externo, p_pedido_id::text)
         ||CASE WHEN p_nf_devolucao IS NOT NULL THEN ' · NF devolução '||p_nf_devolucao ELSE '' END,
       current_date + v_dias, p_motivo, v_operador)
    RETURNING id INTO v_haver_id;
    IF p_desfecho = 'reembolso' THEN
      v_reembolso := public.marcar_haver_devolucao(v_haver_id, 'Reembolso de devolução parcial: '||p_motivo);
    END IF;
  END IF;

  v_dev_numero := public.fn_devolucao_gerar_numero('b2b', p_pedido_id, NULL);
  INSERT INTO public.devolucao (numero, canal, tipo, pedido_id, parceiro_id, status, motivo_codigo, motivo_texto, desfecho, nf_devolucao,
                                valor_credito, haver_id, criado_por, fiscal_acao, nf_original_id, sem_retorno_fisico)
  VALUES (v_dev_numero, 'b2b', 'parcial', p_pedido_id, v_pedido.parceiro_id, 'aguardando_retorno', p_motivo_codigo, p_motivo, p_desfecho, p_nf_devolucao,
          p_valor, v_haver_id, v_operador, p_fiscal_acao, v_nf.id, (coalesce(p_fiscal_acao,'') <> 'nf_devolucao'))
  RETURNING id INTO v_dev_id;

  IF p_itens IS NOT NULL AND jsonb_typeof(p_itens) = 'array' THEN
    INSERT INTO public.devolucao_item (devolucao_id, sku, descricao, qtd_declarada, valor_unitario)
    SELECT v_dev_id, x->>'sku',
           coalesce(x->>'descricao', (SELECT e->>'descricao' FROM jsonb_array_elements(coalesce(v_nf.itens_json,'[]'::jsonb)) e WHERE e->>'codigo' = x->>'sku' LIMIT 1)),
           (x->>'quantidade')::numeric,
           coalesce(nullif(x->>'valor_unitario','')::numeric, (SELECT (e->>'valor')::numeric FROM jsonb_array_elements(coalesce(v_nf.itens_json,'[]'::jsonb)) e WHERE e->>'codigo' = x->>'sku' LIMIT 1))
    FROM jsonb_array_elements(p_itens) x
    WHERE x->>'sku' IS NOT NULL AND (x->>'quantidade')::numeric > 0;
    GET DIAGNOSTICS v_itens = ROW_COUNT;
  END IF;

  -- NOTA DE CRÉDITO: estorno de saída não embarcada — espelha a saída de faturamento da NF (centro, classe, custo), condição sadio, sem quarentena
  IF p_fiscal_acao = 'nota_credito' THEN
    INSERT INTO public.movimentacao_estoque (sku, tipo, quantidade, origem, referencia, data_mov, criado_por, obs, centro_id, condicao, motivo, classe, doc_tipo, doc_numero, custo_unitario, pedido_id, nf_saida_id, devolucao_id)
    SELECT di.sku, 'entrada', di.qtd_declarada, 'falta_expedicao', v_dev_numero, now(), v_operador,
           'Falta na expedição (nota de crédito) — '||v_dev_numero||' · NF '||v_nf.numero||' · '||p_motivo,
           coalesce(s.centro_id, 'a0000000-0000-4000-8000-000000000001'::uuid), 'sadio', 'falta_expedicao', coalesce(s.classe,'produto_acabado'),
           'nf_saida', v_nf.numero, s.custo_unitario, p_pedido_id, v_nf.id, v_dev_id
    FROM public.devolucao_item di
    LEFT JOIN LATERAL (SELECT centro_id, classe, custo_unitario FROM public.movimentacao_estoque me
                        WHERE me.nf_saida_id = v_nf.id AND me.sku = di.sku AND me.tipo='saida' ORDER BY me.data_mov DESC LIMIT 1) s ON true
    WHERE di.devolucao_id = v_dev_id;
    GET DIAGNOSTICS v_mov = ROW_COUNT;
  END IF;

  INSERT INTO public.pedido_eventos (pedido_id, tipo_evento, estagio_anterior, estagio_novo, descricao, operador_id, automatico, metadata)
  VALUES (p_pedido_id, 'devolucao', v_pedido.estagio, v_pedido.estagio,
    v_dev_numero||' · Devolução PARCIAL R$ '||to_char(p_valor,'FM999G999D00')||' · desfecho: '||CASE WHEN p_desfecho='nenhum' THEN 'a definir' ELSE p_desfecho END
      ||CASE WHEN p_desfecho='abater_divida' THEN ' · parcela '||v_titulo_numero ELSE '' END
      ||CASE WHEN p_fiscal_acao IS NOT NULL THEN ' · fiscal: '||p_fiscal_acao ELSE '' END
      ||' · NF devolução: '||COALESCE(p_nf_devolucao,'pendente')||' · '||p_motivo,
    v_operador, false,
    jsonb_build_object('devolucao_id', v_dev_id, 'devolucao_numero', v_dev_numero, 'tipo','parcial', 'valor', p_valor, 'desfecho', p_desfecho,
                       'haver_id', v_haver_id, 'nf_devolucao', p_nf_devolucao, 'motivo_codigo', p_motivo_codigo, 'itens_declarados', v_itens,
                       'abate', v_abate, 'fiscal_acao', p_fiscal_acao, 'nf_original_id', v_nf.id, 'movimentos_estoque', v_mov));

  RETURN jsonb_build_object(
    'ok', true, 'pedido_id', p_pedido_id, 'valor_devolvido', p_valor, 'devolucao_id', v_dev_id, 'devolucao_numero', v_dev_numero,
    'itens_declarados', v_itens, 'desfecho', p_desfecho, 'haver_id', v_haver_id, 'nf_devolucao', p_nf_devolucao,
    'fiscal_acao', p_fiscal_acao, 'nf_original_id', v_nf.id, 'movimentos_estoque', v_mov,
    'reembolso', v_reembolso, 'abate', v_abate,
    'aviso', CASE
      WHEN p_desfecho = 'nenhum' THEN 'Desfecho A DEFINIR — nenhum título, boleto ou crédito foi alterado. Decida o desfecho na Mesa de Devoluções.'
      WHEN p_desfecho = 'abater_divida' AND (v_abate->>'aplicado_agora')::boolean THEN 'Parcela reduzida imediatamente (desconto aplicado — sem boleto emitido).'
      WHEN p_desfecho = 'abater_divida' THEN 'Baixa do boleto atual solicitada. Gere a Remessa de Baixa — o novo valor será aplicado quando o banco confirmar, e o boleto novo entra na próxima remessa de entrada.'
      ELSE 'As parcelas em aberto NÃO foram alteradas — o cliente segue devendo o valor original e fica com o crédito.' END,
    'aviso_itens', CASE
      WHEN p_fiscal_acao = 'nota_credito' THEN v_itens||' item(ns) · estoque estornado ('||v_mov||' mov.) · gere o rascunho da nota de crédito na Mesa de Devoluções.'
      WHEN v_itens = 0 THEN 'Nenhum item declarado: esta devolução parcial NÃO vai acender a fila de conferência física. Se há mercadoria voltando, declare os itens.'
      ELSE v_itens||' item(ns) declarado(s) para conferência física.' END
  );
END;
$function$;

DROP FUNCTION IF EXISTS public.decidir_desfecho_devolucao(uuid, text, text);
CREATE OR REPLACE FUNCTION public.decidir_desfecho_devolucao(p_devolucao_id uuid, p_desfecho text, p_motivo text DEFAULT NULL::text, p_titulo_abater uuid DEFAULT NULL::uuid, p_nova_data date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d record; v_enc jsonb; v_b2b jsonb;
  v_t record; v_valor numeric; v_novo numeric; v_data date; v_reemissao jsonb; v_abate jsonb; v_obs text;
begin
  if auth.uid() is not null and not usuario_tem_acao('acao.pedido_devolver') then raise exception 'Sem permissao (acao.pedido_devolver).'; end if;
  if p_desfecho not in ('reembolso','reenvio','haver','troca','abater_divida') then raise exception 'Desfecho inválido: % (reembolso, reenvio, haver, troca ou abater_divida)', p_desfecho; end if;
  select * into d from devolucao where id = p_devolucao_id for update;
  if d.id is null then raise exception 'Devolução não encontrada.'; end if;
  if d.status in ('encerrada','cancelada') then raise exception 'Devolução % já %.', d.numero, d.status; end if;
  if d.desfecho <> 'nenhum' then raise exception 'Devolução % já tem desfecho %.', d.numero, d.desfecho; end if;

  -- 27/10/2026 CRÉDITO-SÓ-SOBRE-O-PAGO (B2B): título em aberto → abater dívida; nada pago → sem crédito.
  if p_desfecho in ('haver','reembolso') and d.canal = 'b2b' and d.pedido_id is not null then
    v_b2b := public.fn_devolucao_haver_disponivel_b2b(d.pedido_id);
    if (v_b2b->>'aberto')::numeric > 0 then
      raise exception 'Crédito só sobre o que foi pago — o pedido tem título em aberto (R$ %). Use abater dívida.', v_b2b->>'aberto';
    end if;
    if (v_b2b->>'disponivel')::numeric <= 0 then
      raise exception 'Crédito só sobre o que foi pago — pago R$ %, já creditado R$ %. Nada a creditar.', v_b2b->>'pago', v_b2b->>'ja_creditado';
    end if;
  end if;

  if p_desfecho = 'abater_divida' then
    if p_titulo_abater is null then raise exception 'Informe a parcela (título) da qual o valor será abatido.'; end if;
    v_valor := d.valor_credito;
    if v_valor is null or v_valor <= 0 then raise exception 'Devolução % sem valor a abater.', d.numero; end if;
    select id, numero_titulo, status, boleto_status, conta_id, coalesce(valor_atual, valor_bruto) as saldo, data_vencimento_atual
      into v_t from public.titulo_a_receber where id = p_titulo_abater and pedido_id = d.pedido_id for update;
    if not found then raise exception 'Parcela não encontrada neste pedido.'; end if;
    if v_t.status = 'pago' then
      raise exception 'Parcela % já está paga — não há dívida para abater (use haver, troca ou reembolso).', v_t.numero_titulo;
    end if;
    if v_t.status in ('cancelado','cancelado_recuperacao','devolvido','baixado_por_perda') then
      raise exception 'Parcela % está encerrada (status %).', v_t.numero_titulo, v_t.status;
    end if;
    if v_valor >= v_t.saldo then
      raise exception 'Valor a abater (R$ %) zera ou excede a parcela % (R$ %). Escolha outra parcela ou use haver/reembolso.',
        to_char(v_valor,'FM999G999D00'), v_t.numero_titulo, to_char(v_t.saldo,'FM999G999D00');
    end if;
    v_novo := v_t.saldo - v_valor;
    if v_t.boleto_status is null or v_t.boleto_status = 'pendente' then
      update public.titulo_a_receber set valor_desconto = valor_desconto + v_valor, updated_at = now() where id = v_t.id;
      update public.contas_pagar_receber set valor = v_novo, updated_at = now()
       where id = v_t.conta_id and status not in ('pago','conciliado','cancelado');
      v_abate := jsonb_build_object('modo','desconto_aplicado_direto','aplicado_agora',true,'novo_valor',v_novo,'numero_titulo',v_t.numero_titulo);
    elsif v_t.boleto_status in ('registrado','vencido','rejeitado') then
      v_data := coalesce(p_nova_data, v_t.data_vencimento_atual);
      if v_data <= current_date then
        raise exception 'O vencimento da parcela % já passou (%). Informe uma nova data futura para o boleto reemitido.',
          v_t.numero_titulo, to_char(v_t.data_vencimento_atual,'DD/MM/YYYY');
      end if;
      v_reemissao := public.solicitar_reemissao_boleto(v_t.id, v_data, v_novo, 'Abatimento de devolução parcial: '||coalesce(p_motivo, d.motivo_texto, d.numero));
      v_abate := jsonb_build_object('modo','baixa_e_reemissao','aplicado_agora',false,'novo_valor',v_novo,'nova_data',v_data,'reemissao',v_reemissao,'numero_titulo',v_t.numero_titulo);
    else
      raise exception 'Boleto da parcela % está em "%" — aguarde a conclusão antes de abater.', v_t.numero_titulo, v_t.boleto_status;
    end if;
    v_obs := ' · parcela '||v_t.numero_titulo||' R$ '||to_char(v_t.saldo,'FM999G999D00')||' → R$ '||to_char(v_novo,'FM999G999D00')
      ||case when (v_abate->>'aplicado_agora')::boolean then ' (desconto aplicado)' else ' (baixa e reemissão '||to_char(v_data,'DD/MM/YYYY')||')' end;
  end if;

  update devolucao set desfecho = p_desfecho, observacao = coalesce(observacao,'') || E'\n' || to_char(now(),'DD/MM/YYYY HH24:MI') || ' · desfecho ' || p_desfecho || coalesce(v_obs,'') || coalesce(' · '||p_motivo,'') where id = d.id;
  insert into pedido_eventos (pedido_id, tipo_evento, descricao, metadata, automatico)
  select d.pedido_id, 'devolucao', d.numero||' · desfecho decidido: '||p_desfecho||coalesce(v_obs,'')||coalesce(' · '||p_motivo,''),
         jsonb_build_object('devolucao_id', d.id, 'desfecho', p_desfecho, 'numero_titulo', v_abate->>'numero_titulo', 'abate', v_abate), false where d.pedido_id is not null;
  begin v_enc := public.fn_devolucao_avaliar_encerramento(d.id); exception when others then v_enc := jsonb_build_object('erro', sqlerrm); end;
  return jsonb_build_object('ok', true, 'devolucao', d.numero, 'desfecho', p_desfecho, 'abate', v_abate, 'encerramento', v_enc);
end $function$;
REVOKE ALL ON FUNCTION public.decidir_desfecho_devolucao(uuid, text, text, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decidir_desfecho_devolucao(uuid, text, text, uuid, date) TO authenticated, service_role;