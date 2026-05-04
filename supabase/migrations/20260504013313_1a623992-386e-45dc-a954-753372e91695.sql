-- Função auxiliar: calcula score de match entre payload e linha existente
CREATE OR REPLACE FUNCTION public.score_match_nf(
  p_cnpj_a text, p_valor_a numeric, p_data_a date, p_numero_a text,
  p_cnpj_b text, p_valor_b numeric, p_data_b date, p_numero_b text
)
RETURNS int
LANGUAGE plpgsql IMMUTABLE
AS $function$
DECLARE
  v_score int := 0;
BEGIN
  IF p_cnpj_a IS NOT NULL AND p_cnpj_b IS NOT NULL AND p_cnpj_a = p_cnpj_b THEN
    v_score := v_score + 1;
  END IF;
  IF p_valor_a IS NOT NULL AND p_valor_b IS NOT NULL
     AND p_valor_a > 0 AND p_valor_b > 0
     AND abs(p_valor_a - p_valor_b) < 0.01 THEN
    v_score := v_score + 1;
  END IF;
  IF p_data_a IS NOT NULL AND p_data_b IS NOT NULL AND p_data_a = p_data_b THEN
    v_score := v_score + 1;
  END IF;
  IF p_numero_a IS NOT NULL AND p_numero_b IS NOT NULL
     AND normalizar_numero_nf(p_numero_a) = normalizar_numero_nf(p_numero_b)
     AND normalizar_numero_nf(p_numero_a) <> '' THEN
    v_score := v_score + 1;
  END IF;
  RETURN v_score;
END;
$function$;

DROP FUNCTION IF EXISTS public.detectar_match_score_nf(jsonb);

CREATE FUNCTION public.detectar_match_score_nf(p_candidatos jsonb)
RETURNS TABLE(
  idx int,
  match_id uuid,
  match_score int,
  match_fornecedor text,
  match_nf_numero text,
  match_valor numeric,
  match_data_emissao date,
  match_tipo_documento text,
  match_parcela text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item jsonb;
  v_idx int := 0;
  v_cnpj text;
  v_valor numeric;
  v_data date;
  v_numero text;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_candidatos)
  LOOP
    v_cnpj := v_item->>'cnpj';
    v_valor := COALESCE((v_item->>'valor')::numeric, 0);
    v_data := NULLIF(v_item->>'data_emissao','')::date;
    v_numero := v_item->>'nf_numero';

    RETURN QUERY
      SELECT
        v_idx,
        ns.id,
        score_match_nf(v_cnpj, v_valor, v_data, v_numero,
                       ns.fornecedor_cnpj, ns.valor, ns.nf_data_emissao, ns.nf_numero) AS s,
        ns.fornecedor_razao_social,
        ns.nf_numero,
        ns.valor,
        ns.nf_data_emissao,
        ns.tipo_documento,
        CASE
          WHEN ns.numero_parcela IS NOT NULL AND ns.total_parcelas IS NOT NULL
            THEN ns.numero_parcela || '/' || ns.total_parcelas
          ELSE NULL
        END
      FROM nfs_stage ns
      WHERE ns.status NOT IN ('descartada','duplicata')
        AND score_match_nf(v_cnpj, v_valor, v_data, v_numero,
                           ns.fornecedor_cnpj, ns.valor, ns.nf_data_emissao, ns.nf_numero) >= 2
      ORDER BY s DESC;

    v_idx := v_idx + 1;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.merge_nf_stage(
  p_nf jsonb,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(stage_id uuid, acao text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_chave text := p_nf->>'nf_chave_acesso';
  v_cnpj text := p_nf->>'fornecedor_cnpj';
  v_numero_raw text := p_nf->>'nf_numero';
  v_data_emissao date := NULLIF(p_nf->>'nf_data_emissao','')::date;
  v_fonte text := COALESCE(p_nf->>'fonte', p_nf->>'_source', 'desconhecida');
  v_tipo_doc text := COALESCE(p_nf->>'tipo_doc', 'pdf_danfe');
  v_storage_path text := p_nf->>'arquivo_storage_path';
  v_arquivo_nome text := p_nf->>'arquivo_nome';
  v_linha_digitavel text := p_nf->>'linha_digitavel';
  v_existente_id uuid;
  v_existente_score int;
  v_chegando_eh_xml boolean;
  v_novo_id uuid;
  v_tipo_documento text := COALESCE(p_nf->>'tipo_documento', 'nfe');
  v_pais_emissor text := COALESCE(p_nf->>'pais_emissor', 'BR');
  v_moeda text := COALESCE(p_nf->>'moeda', 'BRL');
  v_fornecedor_razao text := p_nf->>'fornecedor_razao_social';
  v_valor numeric := COALESCE((p_nf->>'valor')::numeric, 0);
  v_doc_existente uuid;
  v_numero_parcela int := NULLIF(p_nf->>'numero_parcela','')::int;
  v_total_parcelas int := NULLIF(p_nf->>'total_parcelas','')::int;
  v_numero_doc_ref text := NULLIF(p_nf->>'numero_documento_referencia','');
BEGIN
  v_chegando_eh_xml := v_tipo_doc = 'xml';

  IF v_tipo_doc NOT IN ('xml','pdf_danfe','pdf_boleto') THEN
    RAISE EXCEPTION 'tipo_doc inválido: %. Aceitos: xml, pdf_danfe, pdf_boleto', v_tipo_doc;
  END IF;

  IF v_chave IS NOT NULL THEN
    SELECT id INTO v_existente_id FROM nfs_stage
    WHERE nf_chave_acesso = v_chave
      AND status NOT IN ('descartada','duplicata') LIMIT 1;
  END IF;

  IF v_existente_id IS NULL THEN
    SELECT ns.id, score_match_nf(
      v_cnpj, v_valor, v_data_emissao, v_numero_raw,
      ns.fornecedor_cnpj, ns.valor, ns.nf_data_emissao, ns.nf_numero
    ) AS s
    INTO v_existente_id, v_existente_score
    FROM nfs_stage ns
    WHERE ns.status NOT IN ('descartada','duplicata')
    ORDER BY s DESC
    LIMIT 1;

    IF v_existente_score IS NULL OR v_existente_score < 3 THEN
      v_existente_id := NULL;
    END IF;
  END IF;

  IF v_existente_id IS NULL THEN
    INSERT INTO nfs_stage (
      fonte, importacao_lote_id, fornecedor_cnpj, fornecedor_razao_social, fornecedor_cliente,
      parceiro_id, nf_numero, nf_chave_acesso, nf_data_emissao, nf_serie, valor,
      descricao, categoria_id, data_vencimento, itens, status, criada_por,
      tipo_documento, pais_emissor, moeda, valor_origem, taxa_conversao,
      numero_parcela, total_parcelas, numero_documento_referencia
    ) VALUES (
      v_fonte, NULLIF(p_nf->>'importacao_lote_id','')::uuid, v_cnpj, v_fornecedor_razao,
      p_nf->>'fornecedor_cliente', NULLIF(p_nf->>'parceiro_id','')::uuid,
      v_numero_raw, v_chave, v_data_emissao, p_nf->>'nf_serie',
      v_valor, p_nf->>'descricao', NULLIF(p_nf->>'categoria_id','')::uuid,
      NULLIF(p_nf->>'data_vencimento','')::date,
      CASE WHEN p_nf ? 'itens' THEN p_nf->'itens' ELSE NULL END,
      'nao_vinculada', p_user_id,
      v_tipo_documento, v_pais_emissor, v_moeda,
      NULLIF(p_nf->>'valor_origem','')::numeric, NULLIF(p_nf->>'taxa_conversao','')::numeric,
      v_numero_parcela, v_total_parcelas, v_numero_doc_ref
    ) RETURNING id INTO v_novo_id;

    IF v_storage_path IS NOT NULL THEN
      INSERT INTO nfs_stage_documentos (
        nfs_stage_id, tipo, storage_path, arquivo_nome, linha_digitavel, criado_por
      ) VALUES (
        v_novo_id, v_tipo_doc, v_storage_path, v_arquivo_nome, v_linha_digitavel, p_user_id
      );
    END IF;

    stage_id := v_novo_id;
    acao := 'criada';
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE nfs_stage SET
    fornecedor_cnpj = CASE
      WHEN v_chegando_eh_xml THEN COALESCE(v_cnpj, fornecedor_cnpj)
      ELSE COALESCE(fornecedor_cnpj, v_cnpj)
    END,
    fornecedor_razao_social = CASE
      WHEN v_chegando_eh_xml THEN COALESCE(v_fornecedor_razao, fornecedor_razao_social)
      ELSE COALESCE(fornecedor_razao_social, v_fornecedor_razao)
    END,
    itens = CASE
      WHEN v_chegando_eh_xml AND p_nf ? 'itens' THEN p_nf->'itens'
      ELSE itens
    END,
    tipo_documento = CASE
      WHEN v_tipo_documento IN ('nfe','nfse') AND tipo_documento IN ('boleto','recibo') THEN v_tipo_documento
      ELSE tipo_documento
    END,
    nf_numero = COALESCE(nf_numero, v_numero_raw),
    nf_chave_acesso = COALESCE(nf_chave_acesso, v_chave),
    nf_data_emissao = COALESCE(nf_data_emissao, v_data_emissao),
    nf_serie = COALESCE(nf_serie, p_nf->>'nf_serie'),
    valor = CASE
      WHEN v_chegando_eh_xml AND v_valor > 0 THEN v_valor
      ELSE valor
    END,
    categoria_id = COALESCE(categoria_id, NULLIF(p_nf->>'categoria_id','')::uuid),
    parceiro_id = COALESCE(parceiro_id, NULLIF(p_nf->>'parceiro_id','')::uuid),
    descricao = COALESCE(descricao, p_nf->>'descricao'),
    numero_parcela = COALESCE(numero_parcela, v_numero_parcela),
    total_parcelas = COALESCE(total_parcelas, v_total_parcelas),
    numero_documento_referencia = COALESCE(numero_documento_referencia, v_numero_doc_ref),
    updated_at = now()
  WHERE id = v_existente_id;

  IF v_storage_path IS NOT NULL THEN
    SELECT id INTO v_doc_existente FROM nfs_stage_documentos
    WHERE nfs_stage_id = v_existente_id
      AND storage_path = v_storage_path
    LIMIT 1;

    IF v_doc_existente IS NULL THEN
      INSERT INTO nfs_stage_documentos (
        nfs_stage_id, tipo, storage_path, arquivo_nome, linha_digitavel, criado_por
      ) VALUES (
        v_existente_id, v_tipo_doc, v_storage_path, v_arquivo_nome, v_linha_digitavel, p_user_id
      );

      stage_id := v_existente_id;
      acao := CASE
        WHEN v_tipo_doc = 'xml' THEN 'enriquecida_xml'
        WHEN v_tipo_doc = 'pdf_boleto' THEN 'enriquecida_boleto'
        ELSE 'enriquecida_pdf'
      END;
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  stage_id := v_existente_id;
  acao := 'duplicada_descartada';
  RETURN NEXT;
END;
$function$;