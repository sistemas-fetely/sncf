CREATE OR REPLACE FUNCTION public.confirmar_acerto_consignado(p_acerto_id uuid, p_data_pagamento date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ACERTO-E-QUE-COBRA. Aqui nasce a cobranca do regime consignado — nunca na saida.
--
-- Modelo 2 (consignacao_fiscal): cria PEDIDO SINTETICO com natureza venda_consignacao.
--   Quando a NF 5114/6114 voltar do Bling, trg_baixa_estoque_nf baixa o estoque DO CENTRO
--   DO PARCEIRO e fn_faturar_pedido cria o titulo pela provisao.
--   27/10/2026 — COBRANCA-PARAMETRIZADA-POR-PARCEIRO: consignado_instrumento (pix|boleto) e
--   consignado_prazo_dias_nf (vencimento = emissao da NF + N). Colunas null = comportamento antigo.
--
-- Modelo 1 (venda_com_acerto): a NF de venda ja saiu na remessa e o titulo rotativo carrega
--   o saldo devedor inteiro. NAO nasce pedido nem provisao.
--   16/09/2026 — ACERTO-VIRA-PARCELA (extensao consciente de FONTE-UNICA-CPR):
--   o acerto confirmado passa a parir um TITULO FILHO (titulo_pai_id = rotativo) com o valor
--   acertado, instrumento pix e vencimento do ciclo. O filho e a parcela cobravel; o pai
--   continua sendo a verdade juridica (NF cheia). vw_titulo_saldo abate filhos abertos do pai.
--   14/10/2026 — ESTORNO-E-CIDADAO: o filho nasce pelo A PAGAR (valor_total - valor_abatimento).
--   Modelo 2 com abatimento > 0 e recusado (fora do escopo v1).
--   14/10/2026 — DIA-DE-PAGAMENTO: vencimento = PROXIMA ocorrencia do consignado_dia_acerto
--   a partir do fim do periodo (fecha dia 10-12, paga dia 15 do MESMO mes), nao mais mes+1.
--   consignado_dia_fechamento e informativo (painel). p_data_pagamento sobrepoe tudo.
declare
  v_ac        record;
  v_pc        record;
  v_pedido_id uuid;
  v_ext       text;
  v_nat       uuid;
  v_forma     uuid;
  v_venc      date;
  v_tit       record;
  v_n_tit     int;
  v_saldo     numeric;
  v_filho_id  uuid;
  v_filho_num text;
  v_apagar    numeric;
  v_fim       date;
  v_forma2    uuid;
  v_instr     text;
  v_prazo_nf  int;
  v_cond      text;
begin
  select * into v_ac from consignado_acerto where id = p_acerto_id for update;
  if not found then
    raise exception 'Acerto % nao encontrado', p_acerto_id using errcode='02000';
  end if;
  if v_ac.status <> 'rascunho' then
    raise exception 'Acerto % ja esta % — nada a confirmar', v_ac.numero, v_ac.status using errcode='23514';
  end if;
  if v_ac.valor_total <= 0 or not exists (select 1 from consignado_acerto_item where acerto_id = p_acerto_id) then
    raise exception 'Acerto % nao tem itens reportados', v_ac.numero using errcode='23514';
  end if;

  v_apagar := round(v_ac.valor_total - coalesce(v_ac.valor_abatimento, 0), 2);
  if v_apagar <= 0 then
    raise exception 'Acerto %: abatimento (R$ %) maior ou igual a venda do ciclo (R$ %) — a pagar seria R$ %. '
      'Ciclo com credito liquido nao se confirma por aqui: trate o excedente manualmente.',
      v_ac.numero, trim(to_char(coalesce(v_ac.valor_abatimento,0),'999G999G990D00')),
      trim(to_char(v_ac.valor_total,'999G999G990D00')),
      trim(to_char(v_apagar,'999G999G990D00')) using errcode='23514';
  end if;

  select * into v_pc from parceiros_comerciais where id = v_ac.parceiro_id;
  select id into v_forma from formas_pagamento where codigo = 'conta_corrente';

  v_fim := coalesce(v_ac.periodo_fim, current_date);
  v_venc := coalesce(p_data_pagamento, case
              when v_pc.consignado_dia_acerto is not null then
                case when extract(day from v_fim)::int <= v_pc.consignado_dia_acerto
                     then (date_trunc('month', v_fim::timestamptz) + make_interval(days => v_pc.consignado_dia_acerto - 1))::date
                     else (date_trunc('month', v_fim::timestamptz) + make_interval(months => 1, days => v_pc.consignado_dia_acerto - 1))::date
                end
              else v_fim + coalesce(v_pc.consignado_cadencia_dias, 30)
            end);

  -- ============================ MODELO 1: venda_com_acerto ============================
  if v_ac.consignado_modelo = 'venda_com_acerto' then

    select count(*) into v_n_tit
      from titulo_a_receber t join pedidos pe on pe.id = t.pedido_id
     where pe.parceiro_id = v_ac.parceiro_id
       and t.tipo_pagamento = 'conta_corrente'
       and t.status = 'aberto' and t.titulo_pai_id is null;

    if v_n_tit = 0 then
      raise exception 'Parceiro % (venda_com_acerto) nao tem titulo rotativo aberto em conta corrente. '
        'No modelo 1 o titulo nasce na remessa, com a NF de venda. Sem ele nao ha o que cobrar — '
        'verifique se a remessa foi faturada.', v_pc.razao_social using errcode='23514';
    end if;
    if v_n_tit > 1 then
      raise exception 'Parceiro % tem % titulos rotativos abertos em conta corrente. O modelo 1 pressupoe '
        'UM titulo que varia (nova remessa soma no mesmo). Consolide antes de acertar.',
        v_pc.razao_social, v_n_tit using errcode='23514';
    end if;

    select t.* into v_tit
      from titulo_a_receber t join pedidos pe on pe.id = t.pedido_id
     where pe.parceiro_id = v_ac.parceiro_id
       and t.tipo_pagamento = 'conta_corrente'
       and t.status = 'aberto' and t.titulo_pai_id is null
     for update of t;

    select saldo_a_receber into v_saldo from vw_titulo_saldo where titulo_id = v_tit.id;

    if v_apagar > v_saldo + 0.01 then
      raise exception 'Acerto % cobra R$ % (venda R$ % - abatimento R$ %) mas o saldo a receber do titulo % e R$ %. '
        'O parceiro nao pode dever menos do que o acerto cobra.', v_ac.numero,
        trim(to_char(v_apagar,'999G999G990D00')),
        trim(to_char(v_ac.valor_total,'999G999G990D00')),
        trim(to_char(coalesce(v_ac.valor_abatimento,0),'999G999G990D00')),
        v_tit.numero_titulo, trim(to_char(v_saldo,'999G999G990D00')) using errcode='23514';
    end if;

    v_filho_num := fn_gerar_numero_titulo(1);
    insert into titulo_a_receber
      (numero_titulo, conta_id, pedido_id, nf_id, titulo_pai_id,
       valor_bruto, valor_desconto, valor_juros, valor_multa, valor_correcao,
       data_criacao, data_emissao_nf, data_vencimento_original, data_vencimento_atual,
       numero_parcela, total_parcelas, tipo_pagamento, forma_pagamento_id,
       condicao_pagamento, status, nivel_prova, created_by)
    values
      (v_filho_num, v_tit.conta_id, v_tit.pedido_id, v_tit.nf_id, v_tit.id,
       v_apagar, 0, 0, 0, 0,
       now(), v_tit.data_emissao_nf, v_venc, v_venc,
       1, 1, 'pix', v_forma,
       'acerto consignado ' || v_ac.numero, 'aberto', 'declarado', auth.uid())
    returning id into v_filho_id;

    update consignado_acerto
       set status = 'confirmado', titulo_id = v_tit.id, titulo_acerto_id = v_filho_id,
           data_confirmacao = now(), updated_at = now()
     where id = p_acerto_id;

    insert into evento_titulo (titulo_id, tipo_evento, ator, origem, payload)
    values (v_tit.id, 'acerto_consignado_confirmado',
      coalesce(auth.uid()::text,'sistema'), 'MANUAL',
      jsonb_build_object('rpc','confirmar_acerto_consignado','acerto_id',p_acerto_id,
        'acerto_numero', v_ac.numero, 'competencia', v_ac.competencia,
        'valor_vendido', v_ac.valor_total, 'valor_abatimento', coalesce(v_ac.valor_abatimento,0),
        'valor_acertado', v_apagar, 'saldo_a_receber_antes', v_saldo,
        'titulo_filho', v_filho_num, 'titulo_filho_id', v_filho_id, 'vencimento_filho', v_venc, 'data_pagamento_informada', p_data_pagamento,
        'consignado_modelo', v_ac.consignado_modelo));

    insert into evento_titulo (titulo_id, tipo_evento, ator, origem, payload)
    values (v_filho_id, 'titulo_criado', coalesce(auth.uid()::text,'sistema'), 'SNCF',
      jsonb_build_object('origem','confirmar_acerto_consignado','acerto', v_ac.numero,
        'titulo_pai', v_tit.numero_titulo, 'valor', v_apagar,
        'venda_ciclo', v_ac.valor_total, 'abatimento', coalesce(v_ac.valor_abatimento,0),
        'vencimento', v_venc));

    return jsonb_build_object('ok', true, 'acerto', v_ac.numero,
      'consignado_modelo', v_ac.consignado_modelo,
      'titulo_rotativo', v_tit.numero_titulo, 'titulo_id', v_tit.id,
      'titulo_acerto', v_filho_num, 'titulo_acerto_id', v_filho_id,
      'vencimento', v_venc,
      'saldo_rotativo_antes', v_saldo,
      'saldo_rotativo_depois', round(v_saldo - v_apagar, 2),
      'valor_vendido', v_ac.valor_total,
      'valor_abatimento', coalesce(v_ac.valor_abatimento,0),
      'valor_a_cobrar', v_apagar,
      'pedido_sintetico', null,
      'proximo_passo', 'Titulo ' || v_filho_num || ' de R$ ' || trim(to_char(v_apagar,'999G999G990D00'))
        || ' criado com vencimento ' || to_char(v_venc,'DD/MM/YYYY')
        || case when coalesce(v_ac.valor_abatimento,0) > 0
             then ' (venda de R$ ' || trim(to_char(v_ac.valor_total,'999G999G990D00'))
               || ' menos abatimento de R$ ' || trim(to_char(v_ac.valor_abatimento,'999G999G990D00')) || ')'
             else '' end
        || '. Ele aparece na Mesa de Cobranca e na Previsao de Recebimento; o rotativo ja aparece '
        || 'liquido deste valor. NAO ha NF a emitir: a NF de venda saiu com a mercadoria. Quando o PIX '
        || 'cair, atribua o credito ao cliente na conciliacao — a alocacao baixa o filho e o acerto liquida.',
      'como_funciona', 'Modelo 1: o rotativo e a divida total (verdade juridica da NF cheia); cada acerto '
        || 'vira um titulo FILHO cobravel pelo A PAGAR (venda - abatimento de estornos). O saldo do pai e '
        || 'sempre calculado (valor - alocado - filhos abertos), nunca gravado.');
  end if;

  -- ========================= MODELO 2: consignacao_fiscal =========================
  if coalesce(v_ac.valor_abatimento, 0) > 0 then
    raise exception 'Acerto % (modelo %) tem abatimento de R$ % — estorno em consignacao fiscal ainda nao e '
      'suportado (o pedido sintetico nao representa credito). Zere o abatimento ou trate o ciclo manualmente.',
      v_ac.numero, v_ac.consignado_modelo,
      trim(to_char(v_ac.valor_abatimento,'999G999G990D00')) using errcode='23514';
  end if;

  -- 27/10/2026 — COBRANCA-PARAMETRIZADA-POR-PARCEIRO (modelo 2). Colunas null = comportamento antigo.
  v_instr    := v_pc.consignado_instrumento;
  v_prazo_nf := v_pc.consignado_prazo_dias_nf;
  v_forma2   := v_forma;
  if v_instr is not null then
    select id into v_forma2 from formas_pagamento where codigo = v_instr;
    if v_forma2 is null then
      raise exception 'Parceiro % tem consignado_instrumento=% mas nao existe forma de pagamento com esse codigo',
        v_pc.razao_social, v_instr using errcode='23514';
    end if;
  end if;
  if v_prazo_nf is not null then
    -- estimativa: a data real nasce na NF (fn_faturar_pedido: emissao + prazo)
    v_venc := coalesce(p_data_pagamento, current_date + v_prazo_nf);
    v_cond := v_prazo_nf::text || ' dias da NF';
  else
    v_cond := coalesce(v_pc.consignado_cadencia_dias,30)::text || ' dias';
  end if;

  v_pedido_id := gen_random_uuid();
  select id into v_nat from naturezas_operacao where codigo = 'venda_consignacao';
  v_ext  := 'ACE-' || replace(v_ac.numero, 'ACE-', '');

  insert into pedidos
    (id, id_externo, parceiro_id, cliente_nome_snapshot, data_pedido,
     valor_bruto, valor_liquido, condicao_solicitada, forma_solicitada,
     estagio, canal, natureza_operacao_id, forma_pagamento_id, observacao)
  values
    (v_pedido_id, v_ext, v_ac.parceiro_id, v_pc.razao_social, current_date,
     v_ac.valor_total, v_ac.valor_total,
     case when v_prazo_nf is not null then v_cond
          when v_instr is not null then v_instr else 'conta corrente' end,
     coalesce(v_instr, 'conta_corrente'),
     'pre_faturamento', 'B2B', v_nat, v_forma2,
     'PEDIDO SINTETICO DE ACERTO CONSIGNADO — gerado por confirmar_acerto_consignado a partir do '
     || v_ac.numero || ' (competencia ' || to_char(v_ac.competencia,'MM/YYYY') || '). '
     || 'Nao e um pedido comercial: e o documento do acerto. Modelo ' || v_ac.consignado_modelo || '.');

  insert into pedido_itens (pedido_id, sku, descricao, quantidade, valor_unitario, desconto_pct, ordem)
  select v_pedido_id, i.sku, coalesce(i.descricao, i.sku), i.quantidade, i.valor_unitario, 0,
         row_number() over (order by i.sku)
  from consignado_acerto_item i where i.acerto_id = p_acerto_id;

  insert into provisao_recebimento
    (pedido_id, numero_parcela, total_parcelas, valor, data_prevista,
     tipo_pagamento, forma_pagamento_id, status, condicao_pagamento)
  values
    (v_pedido_id, 1, 1, v_ac.valor_total, v_venc,
     coalesce(v_instr, 'boleto'), v_forma2, 'prevista',
     v_cond);

  update consignado_acerto
     set status = 'confirmado', pedido_sintetico_id = v_pedido_id,
         data_confirmacao = now(), updated_at = now()
   where id = p_acerto_id;

  insert into pedido_eventos (pedido_id, tipo_evento, descricao, metadata, automatico)
  values (v_pedido_id, 'alterado',
    format('ACERTO CONSIGNADO %s CONFIRMADO — pedido sintetico criado. %s item(ns), R$ %s. Modelo %s.',
      v_ac.numero, (select count(*) from consignado_acerto_item where acerto_id = p_acerto_id),
      to_char(v_ac.valor_total,'FM999999990.00'), v_ac.consignado_modelo),
    jsonb_build_object('origem','confirmar_acerto_consignado','acerto_id',p_acerto_id,
      'acerto_numero', v_ac.numero, 'valor', v_ac.valor_total,
      'consignado_modelo', v_ac.consignado_modelo,
      'instrumento', coalesce(v_instr,'boleto'), 'prazo_dias_nf', v_prazo_nf), true);

  -- COBERTURA-NAO-PODE-FICAR-CEGA (01/10/2026)
  BEGIN
    PERFORM public.fn_cobertura_refresh();
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO pedido_eventos (pedido_id, tipo_evento, descricao, metadata, automatico)
    VALUES (v_pedido_id, 'alterado',
      'Cobertura de lastro nao recalculada: ' || SQLERRM ||
      '. Os itens ficam como "Apurando lastro" ate o proximo ciclo automatico.',
      jsonb_build_object('erro', SQLERRM, 'sqlstate', SQLSTATE), true);
  END;

  return jsonb_build_object('ok', true, 'acerto', v_ac.numero,
    'consignado_modelo', v_ac.consignado_modelo,
    'pedido_sintetico', v_ext, 'pedido_id', v_pedido_id,
    'valor', v_ac.valor_total,
    'vencimento', case when v_prazo_nf is not null
      then 'Emissao da NF de venda + ' || v_prazo_nf || ' dias (estimativa hoje: ' || to_char(v_venc,'DD/MM/YYYY') || ')'
      else to_char(v_venc,'YYYY-MM-DD') end,
    'vencimento_estimado', v_venc,
    'instrumento', coalesce(v_instr, 'boleto'),
    'prazo_dias_nf', v_prazo_nf,
    'proximo_passo', 'Emitir a NF de venda em consignacao no Bling (CFOP 5114/6114).'
      || case when v_prazo_nf is not null
           then ' O vencimento final sera a data de emissao da NF + ' || v_prazo_nf || ' dias'
             || case when v_instr is not null then ', cobrado por ' || upper(v_instr) else '' end || '.'
           else '' end,
    'como_funciona', 'Pedido sintetico nasce em pre_faturamento.');
end;
$function$;