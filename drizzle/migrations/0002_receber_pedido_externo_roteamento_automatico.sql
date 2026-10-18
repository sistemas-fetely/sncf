CREATE OR REPLACE FUNCTION public.receber_pedido_externo(p_cnpj text, p_id_externo text, p_data_pedido date, p_valor_bruto numeric, p_valor_liquido numeric, p_condicao_solicitada text, p_forma_solicitada text, p_desconto_pct numeric DEFAULT NULL::numeric, p_vendedor text DEFAULT NULL::text, p_origem text DEFAULT NULL::text, p_itens_json jsonb DEFAULT NULL::jsonb, p_recebido_via text DEFAULT 'api'::text, p_razao_social text DEFAULT NULL::text, p_nome_fantasia text DEFAULT NULL::text, p_inscricao_estadual text DEFAULT NULL::text, p_isento_ie boolean DEFAULT NULL::boolean, p_situacao_cadastral text DEFAULT NULL::text, p_cep text DEFAULT NULL::text, p_logradouro text DEFAULT NULL::text, p_numero text DEFAULT NULL::text, p_complemento text DEFAULT NULL::text, p_bairro text DEFAULT NULL::text, p_cidade text DEFAULT NULL::text, p_uf text DEFAULT NULL::text, p_telefone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_endereco_entrega jsonb DEFAULT NULL::jsonb, p_contatos jsonb DEFAULT NULL::jsonb, p_segmento text DEFAULT NULL::text, p_regiao_atuacao text DEFAULT NULL::text, p_canal_fop text DEFAULT NULL::text, p_tags text[] DEFAULT NULL::text[], p_observacao text DEFAULT NULL::text, p_premissas jsonb DEFAULT NULL::jsonb, p_observacao_pedido text DEFAULT NULL::text, p_observacao_cliente text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cnpj_limpo          text;
  v_eh_pf               boolean := false;
  v_parceiro_id         uuid;
  v_pedido_id           uuid;
  v_pedido_existente_id uuid;
  v_estagio             text;
  v_area                text;
  v_analise_id          uuid;
  v_cadastro_incompleto boolean;
  v_natureza_codigo     text;
  v_nat_desc_pct        numeric;
  v_desc_valor          numeric := 0;
  v_desc_pct            numeric;
  v_liquido             numeric;
  v_rot                 json;
BEGIN
  v_cnpj_limpo := regexp_replace(p_cnpj, '[^0-9]', '', 'g');
  v_eh_pf := (length(v_cnpj_limpo) = 11);
  IF length(v_cnpj_limpo) != 11 AND length(v_cnpj_limpo) != 14 THEN
    RAISE EXCEPTION 'Documento inválido: deve ter 11 (CPF) ou 14 (CNPJ) dígitos (recebido: %)', p_cnpj
      USING ERRCODE = '22023';
  END IF;

  IF p_valor_bruto <= 0 OR p_valor_liquido <= 0 THEN
    RAISE EXCEPTION 'Valores devem ser positivos (bruto=%, liquido=%)',
      p_valor_bruto, p_valor_liquido
      USING ERRCODE = '22023';
  END IF;

  SELECT id, parceiro_id, estagio, area_atual
  INTO v_pedido_existente_id, v_parceiro_id, v_estagio, v_area
  FROM pedidos WHERE id_externo = p_id_externo;

  IF v_pedido_existente_id IS NOT NULL THEN
    SELECT id INTO v_analise_id
    FROM analises_credito WHERE pedido_id = v_pedido_existente_id;

    RETURN json_build_object(
      'pedido_id',      v_pedido_existente_id,
      'parceiro_id',    v_parceiro_id,
      'status',         'ja_existe',
      'estagio_inicial', v_estagio,
      'area_inicial',   v_area,
      'analise_id',     v_analise_id
    );
  END IF;

  SELECT id INTO v_parceiro_id
  FROM parceiros_comerciais WHERE cnpj = v_cnpj_limpo;

  IF v_parceiro_id IS NULL THEN
    v_cadastro_incompleto := (
      p_razao_social IS NULL
      OR p_cidade IS NULL
      OR p_uf IS NULL
    );

    INSERT INTO parceiros_comerciais (
      cnpj, cpf, tipo_pessoa, razao_social, nome_fantasia, inscricao_estadual, isento_ie,
      situacao_cadastral, cep, logradouro, numero, endereco_complemento,
      bairro, cidade, uf, telefone, email,
      endereco_entrega, contatos, segmento, regiao_atuacao, canal_fop,
      tags, observacao, premissas, cadastro_incompleto, origem, tipos
    ) VALUES (
      v_cnpj_limpo,
      CASE WHEN v_eh_pf THEN v_cnpj_limpo ELSE NULL END,
      CASE WHEN v_eh_pf THEN 'PF' ELSE 'PJ' END,
      COALESCE(p_razao_social, CASE WHEN v_eh_pf THEN 'Pessoa física a identificar' ELSE 'A enriquecer via BrasilAPI' END),
      p_nome_fantasia, p_inscricao_estadual,
      COALESCE(p_isento_ie, false),
      p_situacao_cadastral, p_cep, p_logradouro, p_numero, p_complemento,
      p_bairro, p_cidade, p_uf, p_telefone, p_email,
      p_endereco_entrega, p_contatos, p_segmento, p_regiao_atuacao, p_canal_fop,
      p_tags, p_observacao, p_premissas, v_cadastro_incompleto,
      COALESCE(p_origem, 'fop'), ARRAY['cliente']
    ) RETURNING id INTO v_parceiro_id;

  ELSE
    UPDATE parceiros_comerciais SET
      razao_social         = COALESCE(razao_social, p_razao_social),
      nome_fantasia        = COALESCE(nome_fantasia, p_nome_fantasia),
      inscricao_estadual   = COALESCE(inscricao_estadual, p_inscricao_estadual),
      situacao_cadastral   = COALESCE(situacao_cadastral, p_situacao_cadastral),
      cep                  = COALESCE(cep, p_cep),
      logradouro           = COALESCE(logradouro, p_logradouro),
      numero               = COALESCE(numero, p_numero),
      endereco_complemento = COALESCE(endereco_complemento, p_complemento),
      bairro               = COALESCE(bairro, p_bairro),
      cidade               = COALESCE(cidade, p_cidade),
      uf                   = COALESCE(uf, p_uf),
      telefone             = COALESCE(telefone, p_telefone),
      email                = COALESCE(email, p_email),
      endereco_entrega     = COALESCE(endereco_entrega, p_endereco_entrega),
      contatos             = COALESCE(contatos, p_contatos),
      segmento             = COALESCE(segmento, p_segmento),
      regiao_atuacao       = COALESCE(regiao_atuacao, p_regiao_atuacao),
      canal_fop            = COALESCE(canal_fop, p_canal_fop),
      tags                 = COALESCE(tags, p_tags),
      observacao           = COALESCE(observacao, p_observacao),
      premissas            = COALESCE(premissas, p_premissas),
      updated_at           = now()
    WHERE id = v_parceiro_id;
  END IF;

  v_natureza_codigo := CASE
    WHEN substr(v_cnpj_limpo, 1, 8) = '63591078'                     THEN 'transferencia_interna'
    WHEN lower(coalesce(p_condicao_solicitada, '')) LIKE '%bonific%' THEN 'bonificacao'
    ELSE 'venda'
  END;

  v_desc_pct := p_desconto_pct;
  v_liquido  := p_valor_liquido;

  SELECT n.desconto_pct INTO v_nat_desc_pct
    FROM naturezas_operacao n
   WHERE n.codigo = v_natureza_codigo
     AND n.ativo
     AND n.precificacao = 'tabela_com_desconto';

  IF COALESCE(v_nat_desc_pct,0) > 0 AND COALESCE(p_desconto_pct,0) = 0 THEN
    v_desc_pct   := v_nat_desc_pct;
    v_desc_valor := ROUND(p_valor_bruto * v_nat_desc_pct / 100.0, 2);
    v_liquido    := ROUND(p_valor_bruto - v_desc_valor, 2);
  END IF;

  INSERT INTO pedidos (
    id_externo, parceiro_id, data_pedido,
    valor_bruto, valor_liquido, desconto_pct, desconto_celebra_valor,
    condicao_solicitada, condicao_origem, forma_solicitada,
    vendedor, origem, itens_json, recebido_via,
    observacao_pedido,
    observacao_cliente,
    natureza_operacao_id
  ) VALUES (
    p_id_externo, v_parceiro_id, p_data_pedido,
    p_valor_bruto, v_liquido, v_desc_pct, COALESCE(v_desc_valor,0),
    public.fn_resolver_condicao(p_condicao_solicitada), p_condicao_solicitada, p_forma_solicitada,
    p_vendedor, p_origem, p_itens_json, p_recebido_via,
    NULLIF(btrim(COALESCE(p_observacao_pedido,  '')), ''),
    NULLIF(btrim(COALESCE(p_observacao_cliente, '')), ''),
    COALESCE(
      (SELECT id FROM naturezas_operacao WHERE codigo = v_natureza_codigo),
      (SELECT id FROM naturezas_operacao WHERE codigo = 'venda')
    )
  ) RETURNING id INTO v_pedido_id;

  IF v_desc_valor > 0 THEN
    INSERT INTO pedido_eventos (pedido_id, tipo_evento, descricao, metadata, automatico)
    VALUES (v_pedido_id, 'alterado',
      'Desconto padrao da natureza aplicado no nascimento: '
        || to_char(v_desc_pct,'FM990.00') || '% (' || v_natureza_codigo || ')',
      jsonb_build_object(
        'acao','desconto_nasce_com_a_natureza',
        'natureza', v_natureza_codigo,
        'desconto_pct', v_desc_pct,
        'desconto_valor', v_desc_valor,
        'liquido_origem', p_valor_liquido,
        'liquido_aplicado', v_liquido,
        'origem','receber_pedido_externo'),
      true);
  END IF;

  -- 5b. ROTEAMENTO-AUTOMATICO (17/10/2026, decisao Flavio).
  BEGIN
    v_rot := public.rotear_pedido(v_pedido_id);
    IF COALESCE((v_rot->>'ok')::boolean, false) = false THEN
      INSERT INTO pedido_eventos (pedido_id, tipo_evento, descricao, metadata, automatico)
      VALUES (v_pedido_id, 'alterado',
        'Roteamento automatico pendente: ' || COALESCE(v_rot->>'motivo', 'sem motivo'),
        jsonb_build_object(
          'acao','roteamento_pendente',
          'motivo', v_rot->>'motivo',
          'mensagem', v_rot->>'mensagem',
          'origem','receber_pedido_externo'),
        true);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO pedido_eventos (pedido_id, tipo_evento, descricao, metadata, automatico)
    VALUES (v_pedido_id, 'erro_automacao',
      format('Falha no roteamento automatico: %s', SQLERRM),
      jsonb_build_object('erro_origem','rotear_pedido','sqlstate',SQLSTATE,'sqlerrm',SQLERRM),
      true);
  END;

  SELECT estagio, area_atual INTO v_estagio, v_area
  FROM pedidos WHERE id = v_pedido_id;

  SELECT id INTO v_analise_id
  FROM analises_credito WHERE pedido_id = v_pedido_id;

  RETURN json_build_object(
    'pedido_id',       v_pedido_id,
    'parceiro_id',     v_parceiro_id,
    'status',          'criado',
    'estagio_inicial', v_estagio,
    'area_inicial',    v_area,
    'analise_id',      v_analise_id
  );
END;
$function$;