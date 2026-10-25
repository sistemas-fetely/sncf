CREATE OR REPLACE FUNCTION public.vd_remontar_pagamento(p_pedido_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- PEDIDOS SITE SP (29/09/2026): remonta o portao (100% a vista) depois que o plano foi invalidado
-- (edicao de itens ou troca de meio). Regra deterministica, gesto explicito.
-- LINK-ANTIGO-MORRE-NO-SAFRA (03/10/2026): nao marca mais o link antigo como cancelado so no SNCF
-- (ele seguia pagavel no Safra). O link fica aberto com o portao antigo desfeito (provisao_id nulo);
-- o safrapay-link (ao gerar o novo) e o safrapay-link-sync o cancelam no Safra.
-- 25/10/2026 CARTAO-MAQUININHA: maquininha nao precisa de link novo.
DECLARE v_uid uuid := auth.uid(); v record; v_ativo record; v_plano jsonb; v_prov uuid; v_pix jsonb; v_link text; v_forma text;
BEGIN
  IF v_uid IS NULL AND current_user NOT IN ('postgres','supabase_admin') THEN RAISE EXCEPTION 'Sessao obrigatoria.'; END IF;
  IF v_uid IS NOT NULL AND NOT public.tem_permissao('tela.venda_direta_gestao', v_uid) THEN
    RAISE EXCEPTION 'Sem permissao para remontar pagamento.' USING ERRCODE = '42501';
  END IF;
  SELECT p.id, p.id_externo, p.estagio, p.origem, p.cancelado_em, p.valor_liquido, p.forma_solicitada INTO v
    FROM pedidos p WHERE p.id = p_pedido_id FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Pedido nao encontrado.'; END IF;
  IF v.origem <> 'venda_direta' THEN RAISE EXCEPTION 'Remontar pagamento aqui so vale para Pedidos Site SP.'; END IF;
  IF v.cancelado_em IS NOT NULL THEN RAISE EXCEPTION 'Pedido % cancelado.', v.id_externo; END IF;
  IF v.estagio NOT IN ('aguardando_pagamento','cobranca') THEN
    RAISE EXCEPTION 'Pedido % nao esta aguardando pagamento (estagio %).', v.id_externo, v.estagio;
  END IF;
  IF EXISTS (SELECT 1 FROM provisao_recebimento WHERE pedido_id = v.id AND pago_em IS NOT NULL) THEN
    RAISE EXCEPTION 'Pedido % ja tem pagamento registrado — remontar exige tratamento na Cobranca.', v.id_externo;
  END IF;
  SELECT id, valor INTO v_ativo FROM provisao_recebimento
   WHERE pedido_id = v.id AND eh_portao AND pago_em IS NULL AND coalesce(status,'') NOT IN ('cancelada')
   ORDER BY created_at DESC LIMIT 1;
  IF v_ativo.id IS NOT NULL AND round(v_ativo.valor, 2) = round(v.valor_liquido, 2) THEN
    RAISE EXCEPTION 'Pedido % ja tem portao valido de R$ % — nada a remontar.', v.id_externo, v_ativo.valor;
  END IF;
  -- montar_plano_pagamento exige estagio cobranca: volta pela transicao oficial (fica no historico).
  IF v.estagio = 'aguardando_pagamento' THEN
    PERFORM public.transicionar_pedido(v.id, 'cobranca', NULL, 'Pedidos Site SP: remontar pagamento', false);
  END IF;
  v_forma := CASE WHEN v.forma_solicitada IN ('cartao','cartao_credito') THEN 'cartao' ELSE coalesce(v.forma_solicitada, 'pix') END;
  v_plano := public.montar_plano_pagamento(v.id, jsonb_build_array(jsonb_build_object(
    'numero_parcela', 1, 'valor', v.valor_liquido, 'valor_bruto', v.valor_liquido, 'eh_portao', true, 'eh_entrada', false,
    'tipo_pagamento', v_forma, 'data_vencimento', CURRENT_DATE, 'data_prevista', CURRENT_DATE)), 'Pedidos Site SP: pagamento remontado');
  SELECT (e->>'provisao_id')::uuid INTO v_prov FROM jsonb_array_elements(v_plano->'linhas') e WHERE (e->>'eh_portao')::boolean LIMIT 1;
  IF v_prov IS NULL THEN RAISE EXCEPTION 'Plano remontado sem linha de portao — verifique na Cobranca.'; END IF;
  IF v_forma = 'pix' THEN
    v_pix := public.gerar_pix_provisao(v_prov);
    v_link := public.fn_url_publica() || '/pagar/' || (v_pix->>'token');
  END IF;
  UPDATE pagamento_link SET erro = 'Pagamento remontado — link anterior sera cancelado no Safra'
   WHERE pedido_id = v.id AND status IN ('criando','aberto') AND provisao_id IS DISTINCT FROM v_prov;
  INSERT INTO pedido_eventos (pedido_id, tipo_evento, descricao, metadata, automatico)
  VALUES (v.id, 'alterado', 'Pagamento remontado: portão de R$ ' || v.valor_liquido || ' (' || v_forma || '). Reenvie o pagamento ao cliente.',
          jsonb_build_object('provisao_id', v_prov, 'valor', v.valor_liquido, 'forma', v_forma, 'por', v_uid), false);
  RETURN jsonb_build_object('ok', true, 'id_externo', v.id_externo, 'valor', v.valor_liquido, 'forma', v_forma, 'provisao_id', v_prov,
    'link_pagamento', v_link, 'pix_copia_cola', v_pix->>'payload', 'precisa_novo_link_cartao', (v_forma <> 'pix' AND public.fn_vd_meio_atual(v.id) <> 'cartao_maquininha'));
END $function$;

CREATE OR REPLACE FUNCTION public.criar_pedido_venda_direta(p_cliente jsonb, p_itens jsonb, p_entrega jsonb, p_pagamento text, p_observacao text DEFAULT NULL::text, p_haver_id uuid DEFAULT NULL::uuid, p_vendedor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
-- 25/10/2026 CARTAO-MAQUININHA: terceiro meio, sem link; prova = comprovante com NSU (fn_confirmar_captura_cartao).
-- VENDA DIRETA SP (28/09/2026). 03/10 CALCULO-UNICO via fn_vd_calcular.
-- 24/10/2026 VENDEDORA: p_vendedor_id obrigatorio quando ha sessao (tela SNCF). Balcao FOP (sem sessao) segue resolvendo via resolver_vendedor_pedido.
-- 22/10/2026 HAVER: p_haver_id aplica credito do cliente (aplicar_haver_pedido). Se cobre tudo, pedido nasce pago (sem PIX/link); senao o resto vai pelo portao p_pagamento.
DECLARE
  v_uid uuid := auth.uid(); v_parceiro uuid; v_cpf text; v_nome text; v_regra uuid; v_forma text; v_natureza uuid; v_centro uuid;
  v_calc jsonb; v_pedido uuid; v_idext text; v_n int; v_total numeric; v_plano jsonb; v_prov uuid; v_pix jsonb; v_link text; v_rot jsonb;
  v_haver record; v_apl json; v_resto numeric;
BEGIN
  IF v_uid IS NULL AND current_user NOT IN ('postgres','supabase_admin') THEN RAISE EXCEPTION 'Sessao obrigatoria para criar pedido.'; END IF;
  IF v_uid IS NOT NULL AND NOT public.tem_permissao('tela.venda_direta_novo', v_uid) THEN RAISE EXCEPTION 'Sem permissao para lancar venda direta.' USING ERRCODE = '42501'; END IF;
  IF v_uid IS NOT NULL AND p_vendedor_id IS NULL THEN RAISE EXCEPTION 'Informe a vendedora do pedido.' USING ERRCODE='22023'; END IF;
  IF p_vendedor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vendedores WHERE id = p_vendedor_id AND ativo AND tipo IN ('interno','diretoria')) THEN RAISE EXCEPTION 'Vendedora invalida ou inativa.' USING ERRCODE='22023'; END IF;
  IF p_pagamento NOT IN ('pix','cartao','cartao_maquininha') THEN RAISE EXCEPTION 'Pagamento deve ser pix, cartao ou cartao_maquininha.' USING ERRCODE='22023'; END IF;
  SELECT id INTO v_regra FROM regras_pagamento_pedido WHERE codigo = p_pagamento AND ativo AND espera_pagamento;
  IF v_regra IS NULL THEN RAISE EXCEPTION 'Regra de pagamento % inexistente ou sem portao.', p_pagamento; END IF;
  v_forma := CASE p_pagamento WHEN 'pix' THEN 'pix' ELSE 'cartao' END;

  v_calc := public.fn_vd_calcular(p_cliente, p_itens, p_entrega);
  -- SHOW-ROOM-CD (25/10/2026): CD da venda direta vem de p_entrega.centro_codigo (padrao SITE-SP), habilitado em centro_canal (canal VD).
  SELECT c.id INTO v_centro FROM centro_distribuicao c
    JOIN centro_canal cc ON cc.centro_codigo = c.codigo AND cc.canal = 'VD' AND cc.habilitado
   WHERE c.codigo = upper(coalesce(nullif(btrim(p_entrega->>'centro_codigo'),''), 'SITE-SP')) AND c.ativo;
  IF v_centro IS NULL THEN
    RAISE EXCEPTION 'CD % nao esta habilitado para venda direta.', upper(coalesce(nullif(btrim(p_entrega->>'centro_codigo'),''), 'SITE-SP')) USING ERRCODE='22023';
  END IF;
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
    frete_tipo, estimativa_frete_valor, endereco_entrega, origem_centro_id, observacao_pedido, itens_json, desconto_pct, vendedor_id)
  VALUES (v_idext, v_parceiro, v_natureza, 'B2C', 'venda_direta', 'manual', CURRENT_DATE, CASE p_pagamento WHEN 'pix' THEN 'PIX a vista' WHEN 'cartao_maquininha' THEN 'Cartão maquininha à vista' ELSE 'Cartão 1x' END, v_forma, v_regra,
    (v_calc->>'valor_itens')::numeric, (v_calc->>'frete_cobrado')::numeric, v_total, v_calc->>'frete_tipo', nullif((v_calc->>'custo_frete')::numeric, 0), v_calc->'endereco_entrega', v_centro,
    nullif(concat_ws(' · ', nullif(p_observacao,''), v_calc->>'obs_beneficio', CASE WHEN p_haver_id IS NOT NULL THEN 'Crédito do cliente aplicado' END), ''), v_calc->'itens_json', (v_calc->>'desconto_pct')::numeric, p_vendedor_id)
  RETURNING id INTO v_pedido;

  SELECT count(*) INTO v_n FROM pedido_itens WHERE pedido_id = v_pedido;
  IF v_n <> jsonb_array_length(v_calc->'itens_json') THEN RAISE EXCEPTION 'Materializacao dos itens falhou: % no json, % na tabela', jsonb_array_length(v_calc->'itens_json'), v_n; END IF;

  INSERT INTO pedido_eventos (pedido_id, tipo_evento, estagio_anterior, estagio_novo, descricao, metadata, automatico)
  VALUES (v_pedido, 'mudou_estagio', NULL, 'recebido', 'Venda direta criada no SNCF (telefone/WhatsApp)',
    jsonb_build_object('criado_por', v_uid, 'vendedor_id', p_vendedor_id, 'pagamento', p_pagamento, 'haver_id', p_haver_id, 'entrega', v_calc->>'modo', 'frete_tipo', v_calc->>'frete_tipo', 'frete', v_calc->'endereco_entrega'->'frete', 'desconto', v_calc->'endereco_entrega'->'desconto', 'avisos', v_calc->'avisos'), false);

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
END $function$;

CREATE OR REPLACE FUNCTION public.vd_editar_pedido(p_pedido_id uuid, p_itens jsonb, p_entrega jsonb, p_observacao text, p_motivo text, p_meio text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
-- 25/10/2026 CARTAO-MAQUININHA: meio cartao_maquininha; cartao<->maquininha com total igual nao remonta (mesmo portao).
-- PEDIDOS SITE SP · EDITAR ANTES DO PAGAMENTO (03/10/2026, decisoes Flavio: cliente fixo; mesma tela do Novo pedido).
-- Mesmo calculo da criacao (fn_vd_calcular). Total mudou -> portao remontado (vd_remontar_pagamento): link/QR novos,
-- link antigo cancelado no Safra pelo safrapay-link/sync. Total igual -> pagamento intocado.
DECLARE v_meio_atual text; v_meio text := lower(nullif(btrim(coalesce(p_meio,'')),'')); v_troca_meio boolean := false; v_uid uuid := auth.uid(); v record; v_cli jsonb; v_calc jsonb; v_total numeric; v_mudou boolean; v_rem jsonb;
  v_prov uuid; v_pix jsonb; v_link text; v_itens_antes jsonb; v_so_cartao boolean := false;
BEGIN
  IF v_uid IS NULL AND current_user NOT IN ('postgres','supabase_admin') THEN RAISE EXCEPTION 'Sessao obrigatoria.'; END IF;
  IF v_uid IS NOT NULL AND NOT (public.tem_permissao('tela.venda_direta_novo', v_uid) OR public.tem_permissao('tela.venda_direta_gestao', v_uid)) THEN
    RAISE EXCEPTION 'Sem permissao para editar pedido do Site SP.' USING ERRCODE = '42501'; END IF;
  IF length(btrim(coalesce(p_motivo,''))) < 3 THEN RAISE EXCEPTION 'Informe o motivo da alteracao.' USING ERRCODE = '22023'; END IF;
  SELECT p.id, p.id_externo, p.estagio, p.origem, p.cancelado_em, p.parceiro_id, p.forma_solicitada, p.valor_liquido,
         p.valor_bruto, p.valor_frete, p.endereco_entrega, p.observacao_pedido, p.itens_json
    INTO v FROM pedidos p WHERE p.id = p_pedido_id FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Pedido nao encontrado.'; END IF;
  IF v.origem <> 'venda_direta' THEN RAISE EXCEPTION 'Editar aqui so vale para Pedidos Site SP.'; END IF;
  IF v.cancelado_em IS NOT NULL THEN RAISE EXCEPTION 'Pedido % cancelado.', v.id_externo; END IF;
  IF v.estagio <> 'aguardando_pagamento' THEN RAISE EXCEPTION 'Pedido % so pode ser editado antes do pagamento (estagio %).', v.id_externo, v.estagio; END IF;
  IF EXISTS (SELECT 1 FROM provisao_recebimento WHERE pedido_id = v.id AND pago_em IS NOT NULL) THEN
    RAISE EXCEPTION 'Pedido % ja tem pagamento registrado — nao pode ser editado.', v.id_externo; END IF;
  IF EXISTS (SELECT 1 FROM vd_devolucao WHERE pedido_id = v.id AND status IN ('solicitada','aprovada','aguardando_devolucao','estorno_enviado','falhou')) THEN
    RAISE EXCEPTION 'Pedido % tem reembolso em andamento.', v.id_externo; END IF;
  PERFORM public.fn_exigir_edicao_permitida(v.id, 'itens', p_motivo);

  -- MEIO-NA-MESMA-GRAVACAO (03/10/2026): a edicao grava itens, entrega, beneficio e meio de uma vez —
  -- o pagamento e refeito uma unica vez, ja no valor novo (o atalho "Trocar meio" dentro da edicao salvava a parte).
  v_meio_atual := public.fn_vd_meio_atual(v.id);
  IF v_meio IS NOT NULL AND v_meio NOT IN ('pix','cartao','cartao_maquininha') THEN RAISE EXCEPTION 'Meio deve ser pix, cartao ou cartao_maquininha.' USING ERRCODE = '22023'; END IF;
  IF v_meio IS NOT NULL AND v_meio <> v_meio_atual THEN
    PERFORM public.alterar_pagamento_pedido(v.id, CASE v_meio WHEN 'pix' THEN 'pix_antecipado' WHEN 'cartao_maquininha' THEN 'cartao_maquininha' ELSE 'cartao_a_vista' END,
                                           'Pedidos Site SP — edicao: ' || btrim(p_motivo));
    UPDATE analises_credito SET formas_aceitas = ARRAY[CASE WHEN v_meio = 'pix' THEN 'pix' ELSE 'cartao' END] WHERE pedido_id = v.id;
    -- cartao-link <-> maquininha: mesma forma; so remonta se o portao nao sobreviveu a troca.
    v_so_cartao := v_meio <> 'pix' AND v_meio_atual <> 'pix'
      AND EXISTS (SELECT 1 FROM provisao_recebimento WHERE pedido_id = v.id AND eh_portao AND pago_em IS NULL AND coalesce(status,'') <> 'cancelada');
    IF v_meio = 'cartao_maquininha' THEN
      UPDATE pagamento_link SET erro = 'Meio trocado para maquininha — link será cancelado no Safra' WHERE pedido_id = v.id AND status IN ('criando','aberto');
    END IF;
    UPDATE pedidos SET estagio = 'aguardando_pagamento' WHERE id = v.id AND estagio = 'cobranca';
    v_troca_meio := true;
    SELECT p.forma_solicitada INTO v.forma_solicitada FROM pedidos p WHERE p.id = v.id;
  END IF;
  SELECT jsonb_build_object('cep', cep, 'logradouro', logradouro, 'numero', numero, 'complemento', endereco_complemento,
                            'bairro', bairro, 'cidade', cidade, 'uf', uf) INTO v_cli FROM parceiros_comerciais WHERE id = v.parceiro_id;
  v_calc := public.fn_vd_calcular(coalesce(v_cli, '{}'::jsonb), p_itens, p_entrega);
  v_total := (v_calc->>'valor_total')::numeric;
  v_mudou := round(v_total, 2) <> round(v.valor_liquido, 2) OR (v_troca_meio AND NOT v_so_cartao);
  v_itens_antes := v.itens_json;

  UPDATE pedidos SET valor_bruto = (v_calc->>'valor_itens')::numeric, valor_frete = (v_calc->>'frete_cobrado')::numeric,
         valor_liquido = v_total, frete_tipo = v_calc->>'frete_tipo', estimativa_frete_valor = nullif((v_calc->>'custo_frete')::numeric, 0),
         endereco_entrega = v_calc->'endereco_entrega', itens_json = v_calc->'itens_json', desconto_pct = (v_calc->>'desconto_pct')::numeric,
         observacao_pedido = nullif(concat_ws(' · ', nullif(p_observacao,''), v_calc->>'obs_beneficio'), '')
   WHERE id = v.id;

  IF v_mudou THEN
    -- plano nao pago morre (mesma mecanica de alterar_pagamento_pedido) e o portao e remontado no valor novo
    DELETE FROM provisao_recebimento WHERE pedido_id = v.id AND status = 'prevista' AND pago_em IS NULL;
    UPDATE pedido_portao SET status = 'cancelado', updated_at = now() WHERE pedido_id = v.id AND status = 'provisorio';
    v_rem := public.vd_remontar_pagamento(v.id);
  END IF;

  INSERT INTO pedido_eventos (pedido_id, tipo_evento, descricao, metadata, automatico)
  VALUES (v.id, 'alterado', 'Pedido alterado antes do pagamento: ' || btrim(p_motivo) ||
          CASE WHEN v_mudou THEN ' · total R$ ' || v.valor_liquido || ' → R$ ' || v_total || ' (pagamento refeito — reenviar ao cliente)' ELSE ' · total inalterado' END,
          jsonb_build_object('motivo', btrim(p_motivo), 'por', v_uid,
            'antes', jsonb_build_object('itens', v_itens_antes, 'valor_itens', v.valor_bruto, 'frete', v.valor_frete, 'total', v.valor_liquido, 'entrega', v.endereco_entrega),
            'depois', jsonb_build_object('itens', v_calc->'itens_json', 'valor_itens', v_calc->'valor_itens', 'frete', v_calc->'frete_cobrado', 'total', v_total, 'entrega', v_calc->'endereco_entrega')), false);

  RETURN jsonb_build_object('ok', true, 'pedido_id', v.id, 'id_externo', v.id_externo, 'valor_itens', (v_calc->>'valor_itens')::numeric,
    'frete_cobrado', (v_calc->>'frete_cobrado')::numeric, 'frete', v_calc->'endereco_entrega'->'frete', 'valor_total', v_total,
    'desconto_pedido', (v_calc->>'desconto_pedido')::numeric, 'desconto', v_calc->'endereco_entrega'->'desconto',
    'pagamento', public.fn_vd_meio_atual(v.id), 'meio_trocado', v_troca_meio,
    'pagamento_refeito', v_mudou, 'valor_anterior', v.valor_liquido,
    'provisao_id', v_rem->'provisao_id', 'link_pagamento', v_rem->>'link_pagamento', 'pix_copia_cola', v_rem->>'pix_copia_cola',
    'avisos', v_calc->'avisos', 'estagio', (SELECT estagio FROM pedidos WHERE id = v.id));
END $function$;

CREATE OR REPLACE FUNCTION public.vd_trocar_meio_pagamento(p_pedido_id uuid, p_meio text, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- 25/10/2026 CARTAO-MAQUININHA: aceita cartao_maquininha; compara pelo codigo da regra; cartao<->maquininha nao remonta (mesmo portao).
-- PEDIDOS SITE SP · TROCAR MEIO (03/10/2026, decisao Flavio: vendedor troca livremente entre PIX e cartao a vista).
-- Encadeia as portas oficiais: alterar_pagamento_pedido (forma/condicao/regra, invalida o plano)
-- -> vd_remontar_pagamento (novo portao no meio novo). Ajusta formas_aceitas da analise automatica.
-- O link antigo (se houver) e cancelado no Safra pelo safrapay-link / safrapay-link-sync.
DECLARE v_uid uuid := auth.uid(); v record; v_meio text := lower(btrim(coalesce(p_meio,''))); v_slug text; v_alt jsonb; v_rem jsonb; v_atual text; v_portao uuid;
BEGIN
  IF v_uid IS NULL AND current_user NOT IN ('postgres','supabase_admin') THEN RAISE EXCEPTION 'Sessao obrigatoria.'; END IF;
  IF v_uid IS NOT NULL AND NOT public.tem_permissao('tela.venda_direta_gestao', v_uid) THEN
    RAISE EXCEPTION 'Sem permissao para trocar o meio de pagamento.' USING ERRCODE = '42501';
  END IF;
  IF v_meio NOT IN ('pix','cartao','cartao_maquininha') THEN RAISE EXCEPTION 'Meio deve ser pix, cartao ou cartao_maquininha.' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_motivo,''))) < 3 THEN RAISE EXCEPTION 'Informe o motivo da troca.' USING ERRCODE = '22023'; END IF;
  SELECT p.id, p.id_externo, p.estagio, p.origem, p.cancelado_em, p.forma_solicitada INTO v FROM pedidos p WHERE p.id = p_pedido_id FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Pedido nao encontrado.'; END IF;
  IF v.origem <> 'venda_direta' THEN RAISE EXCEPTION 'Trocar meio aqui so vale para Pedidos Site SP.'; END IF;
  IF v.cancelado_em IS NOT NULL THEN RAISE EXCEPTION 'Pedido % cancelado.', v.id_externo; END IF;
  IF v.estagio <> 'aguardando_pagamento' THEN
    RAISE EXCEPTION 'Pedido % nao esta aguardando pagamento (estagio %).', v.id_externo, v.estagio;
  END IF;
  IF EXISTS (SELECT 1 FROM provisao_recebimento WHERE pedido_id = v.id AND pago_em IS NOT NULL) THEN
    RAISE EXCEPTION 'Pedido % ja tem pagamento registrado — trocar o meio exige estorno.', v.id_externo;
  END IF;
  v_atual := public.fn_vd_meio_atual(v.id);
  IF v_atual = v_meio THEN
    RAISE EXCEPTION 'Pedido % ja e %.', v.id_externo, v_meio USING ERRCODE = '22023';
  END IF;
  v_slug := CASE v_meio WHEN 'pix' THEN 'pix_antecipado' WHEN 'cartao_maquininha' THEN 'cartao_maquininha' ELSE 'cartao_a_vista' END;
  v_alt := public.alterar_pagamento_pedido(v.id, v_slug, 'Pedidos Site SP — troca de meio: ' || btrim(p_motivo));
  UPDATE analises_credito SET formas_aceitas = ARRAY[CASE WHEN v_meio = 'pix' THEN 'pix' ELSE 'cartao' END] WHERE pedido_id = v.id;
  IF v_meio = 'cartao_maquininha' THEN
    UPDATE pagamento_link SET erro = 'Meio trocado para maquininha — link será cancelado no Safra' WHERE pedido_id = v.id AND status IN ('criando','aberto');
  END IF;
  SELECT pr.id INTO v_portao FROM provisao_recebimento pr
   WHERE pr.pedido_id = v.id AND pr.eh_portao AND pr.pago_em IS NULL AND coalesce(pr.status,'') <> 'cancelada'
   ORDER BY pr.created_at DESC LIMIT 1;
  IF v_meio <> 'pix' AND v_atual <> 'pix' AND v_portao IS NOT NULL THEN
    -- cartao-link <-> maquininha: mesma forma, portao identico; nao remonta.
    SELECT jsonb_build_object('ok', true, 'id_externo', v.id_externo, 'valor', p.valor_liquido, 'forma', 'cartao', 'provisao_id', v_portao,
      'link_pagamento', NULL, 'pix_copia_cola', NULL, 'precisa_novo_link_cartao', v_meio = 'cartao')
      INTO v_rem FROM pedidos p WHERE p.id = v.id;
  ELSE
    v_rem := public.vd_remontar_pagamento(v.id);
  END IF;
  INSERT INTO pedido_eventos (pedido_id, tipo_evento, descricao, metadata, automatico)
  VALUES (v.id, 'alterado', 'Meio de pagamento trocado de ' || coalesce(v_atual,'—') || ' para ' || v_meio || ': ' || btrim(p_motivo),
          jsonb_build_object('de', v_atual, 'para', v_meio, 'motivo', btrim(p_motivo), 'por', v_uid), false);
  RETURN v_rem || jsonb_build_object('meio_anterior', v_atual, 'meio', v_meio);
END $function$;