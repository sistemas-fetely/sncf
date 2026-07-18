-- 🔵 SNCF
-- Espelho: aplicar_regras_categorizacao_stage (hierarquia NCM > CNPJ > texto; bug centro corrigido)
-- Extraído do banco vivo em 18/07/2026 via pg_get_functiondef
-- Destino: supabase/migrations/ via GitHub web

CREATE OR REPLACE FUNCTION public.aplicar_regras_categorizacao_stage(p_stage_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_nf RECORD;
    v_descricao_busca TEXT;
    v_regra_origem TEXT;
    v_plano_contas_id UUID;
    v_centro_custo_id UUID;
    v_ncm_principal TEXT;
BEGIN
    SELECT * INTO v_nf FROM nfs_stage WHERE id = p_stage_id;
    IF v_nf.id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'NF não encontrada');
    END IF;

    -- Preserva classificação humana
    IF v_nf.plano_contas_id IS NOT NULL THEN
        RETURN jsonb_build_object('ok', true, 'acao', 'preservada_classificacao_humana');
    END IF;

    v_plano_contas_id := NULL;
    v_centro_custo_id := NULL;
    v_regra_origem := NULL;

    -- ETAPA 1: regra por NCM (prefixo) — o item decide antes do fornecedor
    IF v_nf.itens IS NOT NULL AND jsonb_array_length(v_nf.itens) > 0 THEN
        v_ncm_principal := v_nf.itens->0->>'ncm';
    END IF;

    IF v_ncm_principal IS NOT NULL AND v_ncm_principal <> '' THEN
        SELECT plano_contas_id, centro_custo_id
        INTO v_plano_contas_id, v_centro_custo_id
        FROM regras_categorizacao
        WHERE ativo = true
          AND ncm_prefixo IS NOT NULL
          AND v_ncm_principal LIKE (ncm_prefixo || '%')
        ORDER BY length(ncm_prefixo) DESC, prioridade ASC
        LIMIT 1;

        IF v_plano_contas_id IS NOT NULL THEN
            v_regra_origem := 'ncm';
        END IF;
    END IF;

    -- ETAPA 2: regra por CNPJ (aplica APENAS plano — centro por fornecedor é rebaixado)
    IF v_plano_contas_id IS NULL AND v_nf.fornecedor_cnpj IS NOT NULL THEN
        SELECT plano_contas_id, NULL::uuid
        INTO v_plano_contas_id, v_centro_custo_id
        FROM regras_categorizacao
        WHERE ativo = true
          AND cnpj_emitente IS NOT NULL
          AND cnpj_emitente = v_nf.fornecedor_cnpj
        ORDER BY prioridade ASC
        LIMIT 1;

        IF v_plano_contas_id IS NOT NULL THEN
            v_regra_origem := 'parceiro';
        END IF;
    END IF;

    -- ETAPA 3: regra por descrição contém
    IF v_plano_contas_id IS NULL THEN
        v_descricao_busca := lower(
            COALESCE(v_nf.fornecedor_razao_social, '') || ' ' ||
            COALESCE(v_nf.descricao, '') || ' ' ||
            COALESCE(v_nf.fornecedor_cliente, '')
        );

        IF length(trim(v_descricao_busca)) > 0 THEN
            SELECT plano_contas_id, centro_custo_id
            INTO v_plano_contas_id, v_centro_custo_id
            FROM regras_categorizacao
            WHERE ativo = true
              AND descricao_contem IS NOT NULL
              AND v_descricao_busca LIKE ('%' || lower(descricao_contem) || '%')
            ORDER BY prioridade ASC
            LIMIT 1;

            IF v_plano_contas_id IS NOT NULL THEN
                v_regra_origem := 'texto';
            END IF;
        END IF;
    END IF;

    -- Se achou regra, atualiza nfs_stage
    -- Centro: COALESCE — nunca sobrescreve centro existente; regra CNPJ não traz centro (NULL)
    IF v_plano_contas_id IS NOT NULL THEN
        UPDATE nfs_stage
        SET plano_contas_id = v_plano_contas_id,
            centro_custo_id = COALESCE(centro_custo_id, v_centro_custo_id),
            updated_at = now()
        WHERE id = p_stage_id;

        RETURN jsonb_build_object(
            'ok', true,
            'acao', 'classificada',
            'plano_contas_id', v_plano_contas_id,
            'origem', v_regra_origem,
            'centro_custo_id', v_centro_custo_id
        );
    END IF;

    RETURN jsonb_build_object('ok', true, 'acao', 'sem_match');
END;
$function$;
