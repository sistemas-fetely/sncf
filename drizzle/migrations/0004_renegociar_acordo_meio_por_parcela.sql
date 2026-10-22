ALTER TABLE public.acordo_renegociacao DROP CONSTRAINT acordo_renegociacao_tipo_pagamento_check;
ALTER TABLE public.acordo_renegociacao ADD CONSTRAINT acordo_renegociacao_tipo_pagamento_check CHECK (tipo_pagamento = ANY (ARRAY['boleto'::text, 'pix'::text, 'cartao'::text, 'misto'::text]));

CREATE OR REPLACE FUNCTION public.renegociar_acordo(p_titulo_ids uuid[], p_parcelas jsonb, p_justificativa text, p_tipo_pagamento text, p_plano_contas_ajuste_id uuid DEFAULT NULL::uuid, p_modalidade smallint DEFAULT 2)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_n_tit int; v_n_found int; v_n_parc int;
  v_p jsonb; v_i int := 0; v_ruim text;
  v_n_clientes int; v_cliente uuid;
  v_saldo_origem numeric(14,2); v_valor_acordado numeric(14,2) := 0; v_ajuste numeric(14,2);
  v_conta record;
  v_anc record; v_pai_unico record;
  v_bandeira boolean; v_vip boolean; v_forma uuid;
  v_acordo_id uuid; v_numero text; v_novo_id uuid;
  v_filhos uuid[] := '{}'; v_instrumentos jsonb := '[]'::jsonb;
  v_boletos_baixa int;
  v_num_parcela smallint; v_tot_parcela smallint;
  -- 22/10/2026 (Flavio): meio por parcela na modalidade 2 (ex.: parte PIX + parte cartão).
  v_tp text; v_tipos text[] := '{}'; v_tipo_acordo text; v_maxp int; v_jp text; v_taxa numeric;
  v_principal numeric(14,2); v_juros numeric(14,2); v_cartoes jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT usuario_tem_acao('acao.titulo_renegociar') THEN
    RAISE EXCEPTION 'Sem permissao (acao.titulo_renegociar). Concessao e feita no Console de Acesso.';
  END IF;

  -- ── Entrada ──
  IF coalesce(p_modalidade, 0) NOT IN (2, 3) THEN
    RETURN jsonb_build_object('ok',false,'erro','Modalidade inválida. Use 2 (parcelamento) ou 3 (troca de instrumento).');
  END IF;
  IF length(coalesce(p_justificativa,'')) < 10 THEN
    RETURN jsonb_build_object('ok',false,'erro','Justificativa obrigatória (mínimo 10 caracteres)');
  END IF;
  v_n_tit := coalesce(array_length(p_titulo_ids,1),0);
  IF v_n_tit < 1 THEN
    RETURN jsonb_build_object('ok',false,'erro','Selecione ao menos um título');
  END IF;
  IF v_n_tit <> (SELECT count(DISTINCT x) FROM unnest(p_titulo_ids) x) THEN
    RETURN jsonb_build_object('ok',false,'erro','Título repetido na seleção');
  END IF;
  v_n_parc := jsonb_array_length(coalesce(p_parcelas,'[]'::jsonb));
  IF v_n_parc < 1 THEN
    RETURN jsonb_build_object('ok',false,'erro','Informe ao menos uma parcela');
  END IF;
  IF p_modalidade = 3 AND v_n_parc <> 1 THEN
    RETURN jsonb_build_object('ok',false,'erro','Troca de instrumento gera exatamente 1 parcela nova');
  END IF;

  PERFORM 1 FROM titulo_a_receber WHERE id = ANY(p_titulo_ids) ORDER BY id FOR UPDATE;
  SELECT count(*) INTO v_n_found FROM titulo_a_receber WHERE id = ANY(p_titulo_ids);
  IF v_n_found <> v_n_tit THEN
    RETURN jsonb_build_object('ok',false,'erro','Título não encontrado');
  END IF;

  -- ── Elegibilidade ──
  SELECT string_agg(t.numero_titulo || ' (' ||
           CASE
             WHEN t.status <> 'aberto' THEN 'status ' || t.status
             WHEN t.tipo_pagamento = 'conta_corrente' THEN 'consignado não entra em acordo'
             WHEN coalesce(s.n_filhos_abertos,0) > 0 THEN 'já dividido em filhos abertos'
             WHEN coalesce(s.saldo_a_receber,0) <= 0 THEN 'sem saldo a receber'
             WHEN EXISTS (SELECT 1 FROM acordo_titulo a WHERE a.titulo_id = t.id) THEN 'já está em outro acordo'
           END || ')', ', ')
    INTO v_ruim
  FROM titulo_a_receber t
  LEFT JOIN vw_titulo_saldo s ON s.titulo_id = t.id
  WHERE t.id = ANY(p_titulo_ids)
    AND (t.status <> 'aberto'
      OR t.tipo_pagamento = 'conta_corrente'
      OR coalesce(s.n_filhos_abertos,0) > 0
      OR coalesce(s.saldo_a_receber,0) <= 0
      OR EXISTS (SELECT 1 FROM acordo_titulo a WHERE a.titulo_id = t.id));
  IF v_ruim IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'erro','Títulos inelegíveis: ' || v_ruim);
  END IF;

  SELECT count(DISTINCT p.parceiro_id), min(p.parceiro_id::text)::uuid
    INTO v_n_clientes, v_cliente
  FROM titulo_a_receber t JOIN pedidos p ON p.id = t.pedido_id
  WHERE t.id = ANY(p_titulo_ids);
  IF v_n_clientes <> 1 OR v_cliente IS NULL THEN
    RETURN jsonb_build_object('ok',false,'erro','Acordo só pode reunir títulos do mesmo cliente');
  END IF;

  SELECT sum(s.saldo_a_receber)::numeric(14,2) INTO v_saldo_origem
  FROM vw_titulo_saldo s WHERE s.titulo_id = ANY(p_titulo_ids);

  -- ── Parcelas ──
  FOR v_p IN SELECT * FROM jsonb_array_elements(p_parcelas) LOOP
    IF coalesce((v_p->>'valor')::numeric,0) <= 0 THEN
      RETURN jsonb_build_object('ok',false,'erro','Parcela com valor inválido');
    END IF;
    IF (v_p->>'data_vencimento')::date <= CURRENT_DATE THEN
      RETURN jsonb_build_object('ok',false,'erro','Vencimento de parcela deve ser futuro');
    END IF;
    v_tp := coalesce(nullif(v_p->>'tipo_pagamento',''), p_tipo_pagamento);
    IF coalesce(v_tp,'') NOT IN ('boleto','pix','cartao')
       OR (v_tp = 'cartao' AND v_p->>'tipo_pagamento' IS NULL AND coalesce(p_modalidade,0) <> 3) THEN
      RETURN jsonb_build_object('ok',false,'erro','Pagamento das novas parcelas deve ser boleto, pix ou cartão (cartão no parcelamento é escolhido por parcela)');
    END IF;
    IF v_tp = 'cartao' AND v_p->>'tipo_pagamento' = 'cartao' THEN
      v_maxp := coalesce((v_p->>'max_parcelas')::int, 0);
      v_jp := coalesce(v_p->>'juros_por','');
      IF v_maxp NOT BETWEEN 1 AND 12 THEN
        RETURN jsonb_build_object('ok',false,'erro','Nº de parcelas do cartão deve ser de 1 a 12');
      END IF;
      IF v_jp NOT IN ('cliente','fetely') THEN
        RETURN jsonb_build_object('ok',false,'erro','Juros do cartão por conta de: cliente ou fetely');
      END IF;
      IF v_jp = 'cliente' AND NOT EXISTS (SELECT 1 FROM safrapay_taxa_parcelamento WHERE parcelas = v_maxp) THEN
        RETURN jsonb_build_object('ok',false,'erro','Taxa de parcelamento para ' || v_maxp || 'x não cadastrada — cadastre ou escolha juros por conta da Fetely');
      END IF;
    END IF;
    IF NOT v_tp = ANY(v_tipos) THEN v_tipos := array_append(v_tipos, v_tp); END IF;
    -- ajuste contábil sobre o PRINCIPAL (juros do cartão ficam fora)
    v_valor_acordado := v_valor_acordado + round((v_p->>'valor')::numeric,2);
  END LOOP;
  v_tipo_acordo := CASE WHEN array_length(v_tipos,1) > 1 THEN 'misto' ELSE v_tipos[1] END;
  v_ajuste := v_valor_acordado - v_saldo_origem;

  -- ── Ajuste: conta folha, natureza coerente e com linha no DRE ──
  IF v_ajuste <> 0 THEN
    IF p_plano_contas_ajuste_id IS NULL THEN
      RETURN jsonb_build_object('ok',false,'erro',
        CASE WHEN v_ajuste > 0 THEN 'Acréscimo de R$ ' ELSE 'Desconto de R$ ' END
        || to_char(abs(v_ajuste),'FM999999990.00') || ' exige a conta contábil do ajuste');
    END IF;
    SELECT pc.id, pc.codigo, pc.nome, pc.tipo, pc.dre_linha_id, coalesce(pc.ativo,true) AS ativo,
           EXISTS (SELECT 1 FROM plano_contas f WHERE f.parent_id = pc.id) AS tem_filho
      INTO v_conta FROM plano_contas pc WHERE pc.id = p_plano_contas_ajuste_id;
    IF NOT FOUND OR NOT v_conta.ativo OR v_conta.tem_filho THEN
      RETURN jsonb_build_object('ok',false,'erro','Conta do ajuste deve ser uma conta folha ativa do plano de contas');
    END IF;
    IF v_ajuste > 0 AND v_conta.tipo <> 'receita' THEN
      RETURN jsonb_build_object('ok',false,'erro','Acréscimo deve ir para uma conta de receita (escolhida: ' || v_conta.codigo || ' ' || v_conta.nome || ')');
    END IF;
    IF v_ajuste < 0 AND v_conta.tipo = 'receita' THEN
      RETURN jsonb_build_object('ok',false,'erro','Desconto não pode ir para conta de receita (escolhida: ' || v_conta.codigo || ' ' || v_conta.nome || ')');
    END IF;
    IF v_conta.dre_linha_id IS NULL THEN
      RETURN jsonb_build_object('ok',false,'erro','A conta ' || v_conta.codigo || ' não tem linha no DRE — o ajuste não apareceria no resultado');
    END IF;
  END IF;

  -- ── Âncora: pedido mais antigo ──
  SELECT t.pedido_id, t.conta_id, t.nf_id, t.parceiro_id
    INTO v_anc
  FROM titulo_a_receber t JOIN pedidos p ON p.id = t.pedido_id
  WHERE t.id = ANY(p_titulo_ids)
  ORDER BY p.data_pedido NULLS LAST, t.data_vencimento_original, t.numero_titulo
  LIMIT 1;

  -- 1 título de origem: linhagem direta e, se vira 1 parcela, ocupa o lugar dele na série (PARCELA-HERDA-NA-SUBSTITUICAO)
  IF v_n_tit = 1 THEN
    SELECT id, numero_parcela, total_parcelas INTO v_pai_unico FROM titulo_a_receber WHERE id = p_titulo_ids[1];
  END IF;

  SELECT bool_or(t.flag_bandeira_amarela OR t.data_vencimento_atual < CURRENT_DATE),
         bool_or(t.vip_relacionamento)
    INTO v_bandeira, v_vip
  FROM titulo_a_receber t WHERE t.id = ANY(p_titulo_ids);

  -- ── Cabeçalho ──
  v_numero := 'ACD-' || to_char(CURRENT_DATE,'YYYY') || '-' || lpad(nextval('acordo_renegociacao_seq')::text, 5, '0');
  INSERT INTO acordo_renegociacao (numero_acordo, cliente_id, pedido_ancora_id, justificativa, tipo_pagamento,
                                   saldo_origem, valor_acordado, plano_contas_ajuste_id, n_parcelas, created_by)
  VALUES (v_numero, v_cliente, v_anc.pedido_id, p_justificativa, v_tipo_acordo,
          v_saldo_origem, v_valor_acordado,
          CASE WHEN v_ajuste <> 0 THEN p_plano_contas_ajuste_id END,
          v_n_parc, auth.uid())
  RETURNING id INTO v_acordo_id;

  INSERT INTO acordo_titulo (acordo_id, titulo_id, saldo_na_data, peso)
  SELECT v_acordo_id, s.titulo_id, s.saldo_a_receber, round(s.saldo_a_receber / v_saldo_origem, 10)
  FROM vw_titulo_saldo s WHERE s.titulo_id = ANY(p_titulo_ids);

  UPDATE acordo_titulo a
  SET peso = a.peso + (1 - (SELECT sum(peso) FROM acordo_titulo WHERE acordo_id = v_acordo_id))
  WHERE a.acordo_id = v_acordo_id
    AND a.titulo_id = (SELECT titulo_id FROM acordo_titulo WHERE acordo_id = v_acordo_id
                       ORDER BY saldo_na_data DESC, titulo_id LIMIT 1);

  -- ── Encerra os títulos de origem; boleto vivo vai pra baixa ──
  SELECT count(*) INTO v_boletos_baixa FROM titulo_a_receber
  WHERE id = ANY(p_titulo_ids) AND boleto_status IN ('registrado','vencido');

  UPDATE titulo_a_receber
  SET status = 'cancelado_recuperacao',
      modalidade_renegociacao = p_modalidade,
      justificativa_renegociacao = p_justificativa,
      boleto_status = CASE WHEN boleto_status IN ('registrado','vencido') THEN 'baixa_solicitada' ELSE boleto_status END
  WHERE id = ANY(p_titulo_ids);

  -- ── Parcelas novas ──
  FOR v_p IN SELECT * FROM jsonb_array_elements(p_parcelas) LOOP
    v_i := v_i + 1;
    v_tp := coalesce(nullif(v_p->>'tipo_pagamento',''), p_tipo_pagamento);
    SELECT id INTO v_forma FROM formas_pagamento WHERE codigo = v_tp AND ativo LIMIT 1;
    v_principal := round((v_p->>'valor')::numeric,2);
    v_juros := 0; v_taxa := NULL;
    IF v_tp = 'cartao' AND v_p->>'tipo_pagamento' = 'cartao' THEN
      v_maxp := (v_p->>'max_parcelas')::int; v_jp := v_p->>'juros_por';
      IF v_jp = 'cliente' THEN
        SELECT taxa_percentual INTO v_taxa FROM safrapay_taxa_parcelamento WHERE parcelas = v_maxp;
        v_juros := round(v_principal * v_taxa / 100, 2);
      END IF;
    END IF;
    IF v_n_tit = 1 AND v_n_parc = 1 THEN
      v_num_parcela := v_pai_unico.numero_parcela;
      v_tot_parcela := v_pai_unico.total_parcelas;
    ELSE
      v_num_parcela := v_i::smallint;
      v_tot_parcela := v_n_parc::smallint;
    END IF;

    INSERT INTO titulo_a_receber (
      numero_titulo, conta_id, pedido_id, nf_id, parceiro_id,
      valor_bruto, data_vencimento_original, data_vencimento_atual,
      numero_parcela, total_parcelas, tipo_pagamento, status,
      forma_pagamento_id, pix_a_prazo, flag_bandeira_amarela, vip_relacionamento,
      acordo_id, titulo_renegociado_origem_id, justificativa_renegociacao, created_by
    ) VALUES (
      v_numero || '-' || lpad(v_i::text, 2, '0'),
      v_anc.conta_id, v_anc.pedido_id, v_anc.nf_id, v_anc.parceiro_id,
      v_principal + v_juros,
      (v_p->>'data_vencimento')::date, (v_p->>'data_vencimento')::date,
      v_num_parcela, v_tot_parcela, v_tp, 'aberto',
      v_forma, CASE WHEN v_tp = 'pix' THEN true END, v_bandeira, v_vip,
      v_acordo_id, CASE WHEN v_n_tit = 1 THEN v_pai_unico.id END, p_justificativa, auth.uid()
    ) RETURNING id INTO v_novo_id;
    v_filhos := array_append(v_filhos, v_novo_id);

    IF v_juros > 0 THEN
      UPDATE titulo_a_receber SET valor_juros_cartao = v_juros WHERE id = v_novo_id;
    END IF;
    IF v_tp = 'cartao' AND v_p->>'tipo_pagamento' = 'cartao' THEN
      v_cartoes := v_cartoes || jsonb_build_array(jsonb_build_object('titulo_id', v_novo_id, 'principal', v_principal,
        'juros_cartao', v_juros, 'taxa_percentual', v_taxa, 'total_link', v_principal + v_juros,
        'max_parcelas', v_maxp, 'juros_por', v_jp, 'vencimento', (v_p->>'data_vencimento')::date));
    END IF;

    IF v_tp = 'pix' THEN
      v_instrumentos := v_instrumentos || jsonb_build_array(gerar_pix_titulo(v_novo_id));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'modalidade', p_modalidade,
    'acordo_id', v_acordo_id,
    'numero_acordo', v_numero,
    'saldo_origem', v_saldo_origem,
    'valor_acordado', v_valor_acordado,
    'ajuste', v_ajuste,
    'pedido_ancora_id', v_anc.pedido_id,
    'boletos_para_baixa', v_boletos_baixa,
    'filhos', to_jsonb(v_filhos),
    'instrumentos', v_instrumentos,
    'tipo_pagamento', v_tipo_acordo,
    'cartoes', v_cartoes
  );
END;
$function$;