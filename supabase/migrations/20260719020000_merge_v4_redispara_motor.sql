-- 🔵 SNCF
-- Espelho: merge_nf_stage v4 — re-disparo do motor pos-enriquecimento XML
-- Aplicado no banco vivo em 19/07/2026. Par do motor v3.1 (ordem: motor primeiro).
CREATE OR REPLACE FUNCTION public.merge_nf_stage(p_nf jsonb, p_user_id uuid DEFAULT NULL::uuid)
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
    v_plano_contas_id uuid := COALESCE(
        NULLIF(p_nf->>'plano_contas_id','')::uuid,
        NULLIF(p_nf->>'categoria_id','')::uuid
    );
    -- FIX: duplicatas ({fat, dup}) e meio_pagamento (tPag mapeado) do XML
    v_duplicatas jsonb := NULLIF(p_nf->'duplicatas', 'null'::jsonb);
    v_meio_pagamento text := NULLIF(p_nf->>'meio_pagamento','');
BEGIN
    v_chegando_eh_xml := v_tipo_doc = 'xml';

    IF v_tipo_doc NOT IN ('xml','pdf_danfe','pdf_boleto') THEN
        RAISE EXCEPTION 'tipo_doc inválido: %. Aceitos: xml, pdf_danfe, pdf_boleto', v_tipo_doc;
    END IF;

    IF v_chave IS NOT NULL THEN
        SELECT id INTO v_existente_id FROM nfs_stage
        WHERE nf_chave_acesso = v_chave
          AND status NOT IN ('descartada','duplicata')
        LIMIT 1;
    END IF;

    IF v_existente_id IS NULL AND v_cnpj IS NOT NULL AND v_numero_raw IS NOT NULL THEN
        SELECT id INTO v_existente_id FROM nfs_stage
        WHERE fornecedor_cnpj = v_cnpj
          AND nf_numero = v_numero_raw
          AND status NOT IN ('descartada','duplicata')
        LIMIT 1;
    END IF;

    IF v_existente_id IS NULL AND v_chave IS NULL THEN
        SELECT ns.id,
               score_match_nf(v_cnpj, v_valor, v_data_emissao, v_numero_raw,
                              ns.fornecedor_cnpj, ns.valor, ns.nf_data_emissao, ns.nf_numero) AS s
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
            fonte, importacao_lote_id, fornecedor_cnpj, fornecedor_razao_social,
            fornecedor_cliente, parceiro_id, nf_numero, nf_chave_acesso,
            nf_data_emissao, nf_serie, valor, descricao, plano_contas_id,
            data_vencimento, itens, status, criada_por,
            tipo_documento, pais_emissor, moeda, valor_origem, taxa_conversao,
            numero_parcela, total_parcelas, numero_documento_referencia,
            duplicatas, meio_pagamento  -- FIX
        ) VALUES (
            v_fonte,
            NULLIF(p_nf->>'importacao_lote_id','')::uuid,
            v_cnpj,
            v_fornecedor_razao,
            p_nf->>'fornecedor_cliente',
            NULLIF(p_nf->>'parceiro_id','')::uuid,
            v_numero_raw,
            v_chave,
            v_data_emissao,
            p_nf->>'nf_serie',
            v_valor,
            p_nf->>'descricao',
            v_plano_contas_id,
            NULLIF(p_nf->>'data_vencimento','')::date,
            COALESCE(p_nf->'itens', '[]'::jsonb),
            'nao_vinculada',
            p_user_id,
            v_tipo_documento,
            v_pais_emissor,
            v_moeda,
            NULLIF(p_nf->>'valor_origem','')::numeric,
            NULLIF(p_nf->>'taxa_conversao','')::numeric,
            v_numero_parcela,
            v_total_parcelas,
            v_numero_doc_ref,
            v_duplicatas, v_meio_pagamento  -- FIX
        ) RETURNING id INTO v_novo_id;

        IF v_storage_path IS NOT NULL THEN
            INSERT INTO nfs_stage_documentos (nfs_stage_id, tipo, storage_path, arquivo_nome, linha_digitavel, criado_por)
            VALUES (v_novo_id, v_tipo_doc, v_storage_path, v_arquivo_nome, v_linha_digitavel, p_user_id);
        END IF;

        stage_id := v_novo_id;
        acao := 'criada';
        RETURN NEXT;
        RETURN;
    END IF;

    UPDATE nfs_stage SET
        fornecedor_cnpj = CASE WHEN v_chegando_eh_xml THEN COALESCE(v_cnpj, fornecedor_cnpj)
                               ELSE COALESCE(fornecedor_cnpj, v_cnpj) END,
        fornecedor_razao_social = CASE WHEN v_chegando_eh_xml THEN COALESCE(v_fornecedor_razao, fornecedor_razao_social)
                                       ELSE COALESCE(fornecedor_razao_social, v_fornecedor_razao) END,
        itens = CASE WHEN v_chegando_eh_xml AND p_nf ? 'itens' THEN p_nf->'itens' ELSE itens END,
        -- FIX: duplicatas e meio seguem o padrão dos itens — XML vence, senão preserva
        duplicatas = CASE WHEN v_chegando_eh_xml AND v_duplicatas IS NOT NULL THEN v_duplicatas
                          ELSE COALESCE(duplicatas, v_duplicatas) END,
        meio_pagamento = CASE WHEN v_chegando_eh_xml THEN COALESCE(v_meio_pagamento, meio_pagamento)
                              ELSE COALESCE(meio_pagamento, v_meio_pagamento) END,
        tipo_documento = CASE WHEN v_tipo_documento IN ('nfe','nfse') AND tipo_documento IN ('boleto','recibo')
                              THEN v_tipo_documento ELSE tipo_documento END,
        nf_numero = COALESCE(nf_numero, v_numero_raw),
        nf_chave_acesso = COALESCE(nf_chave_acesso, v_chave),
        nf_data_emissao = COALESCE(nf_data_emissao, v_data_emissao),
        nf_serie = COALESCE(nf_serie, p_nf->>'nf_serie'),
        valor = CASE WHEN v_chegando_eh_xml AND v_valor > 0 THEN v_valor ELSE valor END,
        plano_contas_id = COALESCE(plano_contas_id, v_plano_contas_id),
        parceiro_id = COALESCE(parceiro_id, NULLIF(p_nf->>'parceiro_id','')::uuid),
        descricao = COALESCE(descricao, p_nf->>'descricao'),
        numero_parcela = COALESCE(numero_parcela, v_numero_parcela),
        total_parcelas = COALESCE(total_parcelas, v_total_parcelas),
        numero_documento_referencia = COALESCE(numero_documento_referencia, v_numero_doc_ref),
        updated_at = now()
    WHERE id = v_existente_id;

    -- FIX v4 (19/07): re-dispara o motor apos o enriquecimento.
    -- Causa raiz do 0/38 de julho: a linha nasce via PDF sem itens, a ETAPA 0 erra a
    -- chave no INSERT, e nada re-rodava o motor quando o XML completava a linha.
    -- O motor v3.1 tem os guards (revisada => no-op; sugestao pode ser carimbada por
    -- confirmacao previa; sem match => preserva sugestao). Chamada e idempotente.
    IF v_chegando_eh_xml THEN
        PERFORM aplicar_regras_categorizacao_stage(v_existente_id);
    END IF;

    IF v_storage_path IS NOT NULL THEN
        SELECT id INTO v_doc_existente FROM nfs_stage_documentos
        -- FIX v3: guard por path OU tipo — evita violar uq_nfs_stage_documentos_tipo
        -- (cujo rollback desfazia o enriquecimento — ROLLBACK-SILENCIOSO)
        WHERE nfs_stage_id = v_existente_id
          AND (storage_path = v_storage_path OR tipo = v_tipo_doc)
        LIMIT 1;

        IF v_doc_existente IS NULL THEN
            INSERT INTO nfs_stage_documentos (nfs_stage_id, tipo, storage_path, arquivo_nome, linha_digitavel, criado_por)
            VALUES (v_existente_id, v_tipo_doc, v_storage_path, v_arquivo_nome, v_linha_digitavel, p_user_id);
            stage_id := v_existente_id;
            acao := CASE WHEN v_tipo_doc = 'xml' THEN 'enriquecida_xml'
                         WHEN v_tipo_doc = 'pdf_boleto' THEN 'enriquecida_boleto'
                         ELSE 'enriquecida_pdf' END;
            RETURN NEXT;
            RETURN;
        END IF;
    END IF;

    stage_id := v_existente_id;
    acao := 'duplicada_descartada';
    RETURN NEXT;
END;
$function$;
