CREATE OR REPLACE FUNCTION public.criar_pedido_venda_direta(p_cliente jsonb, p_itens jsonb, p_entrega jsonb, p_pagamento text, p_observacao text DEFAULT NULL::text, p_haver_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
-- VENDA DIRETA SP (28/09/2026). 03/10 CALCULO-UNICO via fn_vd_calcular.
-- 22/10/2026 HAVER: p_haver_id aplica credito do cliente (aplicar_haver_pedido). Se cobre tudo, pedido nasce pago (sem PIX/link); senao o resto vai pelo portao p_pagamento.
DECLARE
  v_uid uuid := auth.uid(); v_parceiro uuid; v_cpf text; v_nome text; v_regra uuid; v_forma text; v_natureza uuid; v_centro uuid;
  v_calc jsonb; v_pedido uuid; v_idext text; v_n int; v_total numeric; v_plano jsonb; v_prov uuid; v_pix jsonb; v_link text; v_rot jsonb;
  v_haver record; v_apl json; v_resto numeric;
BEGIN
  IF v_uid IS NULL AND current_user NOT IN ('postgres','supabase_admin') THEN RAISE EXCEPTION 'Sessao obrigatoria para criar pedido.'; END IF;
  IF v_uid IS NOT NULL AND NOT public.tem_permissao('tela.venda_direta_novo', v_uid) THEN RAISE EXCEPTION 'Sem permissao para lancar venda direta.' USING ERRCODE = '42501'; END IF;
  IF p_pagamento NOT IN ('pix','cartao') THEN RAISE EXCEPTION 'Pagamento deve ser pix ou cartao.' USING ERRCODE='22023'; END IF;
  SELECT id INTO v_regra FROM regras_pagamento_pedido WHERE codigo = p_pagamento AND ativo AND espera_pagamento;
  IF v_regra IS NULL THEN RAISE EXCEPTION 'Regra de pagamento % inexistente ou sem portao.', p_pagamento; END IF;
  v_forma := CASE p_pagamento WHEN 'pix' THEN 'pix' ELSE 'cartao' END;

  v_calc := public.fn_vd_calcular(p_cliente, p_itens, p_entrega);
  SELECT id INTO v_centro FROM centro_distribuicao WHERE codigo = 'SITE-SP' AND ativo;
  SELECT id INTO v_natureza FROM naturezas_operacao WHERE codigo = 'venda' AND ativo;

  IF nullif(p_cliente->>'parceiro_id','') IS NOT NULL THEN
    SELECT id, regexp_replace(coalesce(cpf,''),'\D','','g'), razao_social INTO v_parceiro, v_cpf, v_nome FROM parceiros_comerciais WHERE id = (p_cliente->>'parceiro_id')::uuid;
    IF v_parceiro IS NULL THEN RAISE EXCEPTION 'Cliente nao encontrado.'; END IF;
  ELSE
    v_cpf := regexp_replace(coalesce(p_cliente->>'cpf',''),'\D','','g');
    v_nome := nullif(btrim(coalesce(p_cliente->>'nome','')),'');
    IF v_nome IS NULL THEN RAISE EXCEPTION 'Nome do cliente obrigatorio.' USING ERRCODE = '22023'; END IF;
    IF length(v_cpf) <> 11 THEN RAISE EXCEPTION 'CPF invalido (11 digitos).' USING ERRCODE='22023'; END IF;
    SELECT id INTO v_parceiro FROM parceiros_comerciais WHERE regexp_replace(coalesce(cpf,''),'\D','','g') = v_cpf LIMIT 1;
    IF v_parceiro IS NULL THEN
      INSERT INTO parceiros_comerciais (razao_social, nome_fantasia, tipo_pessoa, tipo, tipos, cpf, telefone, email, cep, logradouro, numero, endereco_complemento, bairro, cidade, uf, cadastro_incompleto)
      VALUES (v_nome, v_nome, 'PF', 'pf', ARRAY['cliente'], v_cpf, p_cliente->>'telefone', p_cliente->>'email', p_cliente->>'cep', p_cliente->>'logradouro', p_cliente->>'numero', p_cliente->>'complemento', p_cliente->>'bairro', p_cliente->>'cidade', p_cliente->>'uf', false)
      RETURNING id INTO v_parceiro;
    END IF;
  END IF;
  IF length(coalesce(v_cpf,'')) <> 11 THEN RAISE EXCEPTION 'Cliente sem CPF valido — obrigatorio para a NF.' USING ERRCODE='22023'; END IF;

  -- HAVER: valida antes de criar o pedido
  IF p_haver_id IS NOT NULL THEN
    SELECT * INTO v_haver FROM haver_cliente WHERE id = p_haver_id AND status IN ('disponivel','parcial');
    IF v_haver.id IS NULL THEN RAISE EXCEPTION 'Haver nao disponivel.' USING ERRCODE='22023'; END IF;
    IF v_haver.parceiro_id <> v_parceiro THEN RAISE EXCEPTION 'Haver pertence a outro cliente.' USING ERRCODE='22023'; END IF;
    IF v_haver.data_expiracao IS NOT NULL AND v_haver.data_expiracao < current_date THEN RAISE EXCEPTION 'Haver expirado em %.', to_char(v_haver.data_expiracao,'DD/MM/YYYY') USING ERRCODE='22023'; END IF;
  END IF;

  v_total := (v_calc->>'valor_total')::numeric;
  v_idext := 'VD-' || lpad(nextval('public.seq_pedido_venda_direta')::text, 4, '0');

  INSERT INTO pedidos (id_externo, parceiro_id, natureza_operacao_id, canal, origem, recebido_via, data_pedido, condicao_solicitada, forma_solicitada, regra_pagamento_id, valor_bruto, valor_frete, valor_liquido,
    frete_tipo, estimativa_frete_valor, endereco_entrega, origem_centro_id, observacao_pedido, itens_json, desconto_pct)
  VALUES (v_idext, v_parceiro, v_natureza, 'B2C', 'venda_direta', 'manual', CURRENT_DATE, CASE p_pagamento WHEN 'pix' THEN 'PIX a vista' ELSE 'Cartão 1x' END, v_forma, v_regra,
    (v_calc->>'valor_itens')::numeric, (v_calc->>'frete_cobrado')::numeric, v_total, v_calc->>'frete_tipo', nullif((v_calc->>'custo_frete')::numeric, 0), v_calc->'endereco_entrega', v_centro,
    nullif(concat_ws(' · ', nullif(p_observacao,''), v_calc->>'obs_beneficio', CASE WHEN p_haver_id IS NOT NULL THEN 'Crédito do cliente aplicado' END), ''), v_calc->'itens_json', (v_calc->>'desconto_pct')::numeric)
  RETURNING id INTO v_pedido;

  SELECT count(*) INTO v_n FROM pedido_itens WHERE pedido_id = v_pedido;
  IF v_n <> jsonb_array_length(v_calc->'itens_json') THEN RAISE EXCEPTION 'Materializacao dos itens falhou: % no json, % na tabela', jsonb_array_length(v_calc->'itens_json'), v_n; END IF;

  INSERT INTO pedido_eventos (pedido_id, tipo_evento, estagio_anterior, estagio_novo, descricao, metadata, automatico)
  VALUES (v_pedido, 'mudou_estagio', NULL, 'recebido', 'Venda direta criada no SNCF (telefone/WhatsApp)',
    jsonb_build_object('criado_por', v_uid, 'pagamento', p_pagamento, 'haver_id', p_haver_id, 'entrega', v_calc->>'modo', 'frete_tipo', v_calc->>'frete_tipo', 'frete', v_calc->'endereco_entrega'->'frete', 'desconto', v_calc->'endereco_entrega'->'desconto', 'avisos', v_calc->'avisos'), false);

  v_rot := public.rotear_pedido(v_pedido)::jsonb;

  -- HAVER cobre tudo: aplicar_haver_pedido cria provisao 'haver' e transiciona; sem portao
  IF p_haver_id IS NOT NULL THEN IF v_haver.saldo >= v_total THEN
    v_apl := public.aplicar_haver_pedido(p_haver_id, v_pedido);
    RETURN jsonb_build_object('ok', true, 'pedido_id', v_pedido, 'id_externo', v_idext, 'valor_itens', (v_calc->>'valor_itens')::numeric, 'frete_cobrado', (v_calc->>'frete_cobrado')::numeric,
      'frete', v_calc->'endereco_entrega'->'frete', 'valor_total', v_total, 'desconto_pedido', (v_calc->>'desconto_pedido')::numeric, 'desconto', v_calc->'endereco_entrega'->'desconto',
      'pagamento', 'haver', 'haver', v_apl, 'valor_haver', v_total, 'valor_a_pagar', 0, 'provisao_id', null, 'link_pagamento', null, 'pix_copia_cola', null,
      'avisos', v_calc->'avisos', 'estagio', (SELECT estagio FROM pedidos WHERE id = v_pedido), 'roteamento', v_rot);
  END IF; END IF;

  -- HAVER parcial: aplica o saldo e o portao cobra so o resto
  v_resto := v_total;
  IF p_haver_id IS NOT NULL THEN
    v_apl := public.aplicar_haver_pedido(p_haver_id, v_pedido);
    v_resto := v_total - (v_apl->>'valor_aplicado')::numeric;
  END IF;

  v_plano := public.montar_plano_pagamento(v_pedido,
    jsonb_build_array(jsonb_build_object('numero_parcela', 1, 'valor', v_resto, 'valor_bruto', v_resto, 'eh_portao', true, 'eh_entrada', false, 'tipo_pagamento', v_forma, 'data_vencimento', CURRENT_DATE, 'data_prevista', CURRENT_DATE)),
    'venda direta SP');
  SELECT (e->>'provisao_id')::uuid INTO v_prov FROM jsonb_array_elements(v_plano->'linhas') e WHERE (e->>'eh_portao')::boolean LIMIT 1;
  IF p_pagamento = 'pix' AND v_prov IS NOT NULL THEN
    v_pix := public.gerar_pix_provisao(v_prov);
    v_link := public.fn_url_publica() || '/pagar/' || (v_pix->>'token');
  END IF;

  RETURN jsonb_build_object('ok', true, 'pedido_id', v_pedido, 'id_externo', v_idext, 'valor_itens', (v_calc->>'valor_itens')::numeric, 'frete_cobrado', (v_calc->>'frete_cobrado')::numeric,
    'frete', v_calc->'endereco_entrega'->'frete', 'valor_total', v_total, 'desconto_pedido', (v_calc->>'desconto_pedido')::numeric, 'desconto', v_calc->'endereco_entrega'->'desconto', 'pagamento', p_pagamento,
    'haver', v_apl, 'valor_haver', v_total - v_resto, 'valor_a_pagar', v_resto,
    'provisao_id', v_prov, 'link_pagamento', v_link, 'pix_copia_cola', v_pix->>'payload', 'avisos', v_calc->'avisos', 'estagio', (SELECT estagio FROM pedidos WHERE id = v_pedido), 'roteamento', v_rot);
END $function$