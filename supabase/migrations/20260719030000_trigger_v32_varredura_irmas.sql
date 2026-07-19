-- 🔵 SNCF
-- Espelho: trg_nfs_stage_confirma_classificacao v3.2 — varredura de irmas pos-confirmacao
-- Aplicado no banco vivo em 19/07/2026. Caso exemplar: Bruna julho (302 nao validava 5.830).
CREATE OR REPLACE FUNCTION public.trg_nfs_stage_confirma_classificacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_ncm4 text;
    v_irma RECORD;
BEGIN
    -- so acao humana com classificacao de plano presente e CNPJ conhecido
    IF NEW.revisada_em IS NULL
       OR NEW.revisao_origem IS DISTINCT FROM 'humano'
       OR NEW.plano_contas_id IS NULL
       OR NEW.fornecedor_cnpj IS NULL THEN
        RETURN NEW;
    END IF;

    -- so nos eventos relevantes: carimbo novo ou mudanca de classificacao
    IF NOT (OLD.revisada_em IS NULL
            OR OLD.plano_contas_id IS DISTINCT FROM NEW.plano_contas_id
            OR OLD.centro_custo_id IS DISTINCT FROM NEW.centro_custo_id) THEN
        RETURN NEW;
    END IF;

    v_ncm4 := COALESCE(left(NULLIF(NEW.itens->0->>'ncm',''), 4), '');

    INSERT INTO classificacoes_confirmadas
        (cnpj, ncm_prefixo, plano_contas_id, centro_custo_id,
         valor_max_confirmado, confirmada_em, confirmada_por)
    VALUES
        (NEW.fornecedor_cnpj, v_ncm4, NEW.plano_contas_id, NEW.centro_custo_id,
         COALESCE(NEW.valor, 0), now(), NEW.revisada_por)
    ON CONFLICT (cnpj, ncm_prefixo) DO UPDATE SET
        plano_contas_id      = EXCLUDED.plano_contas_id,
        centro_custo_id      = EXCLUDED.centro_custo_id,
        valor_max_confirmado = GREATEST(classificacoes_confirmadas.valor_max_confirmado,
                                        EXCLUDED.valor_max_confirmado),
        confirmada_em        = now(),
        confirmada_por       = EXCLUDED.confirmada_por;

    -- V3.2: varre as irmas pendentes da mesma chave e re-roda o motor em cada uma.
    -- Motor decide: guarda ok => carimba (motor); anomala => sugestao, fica na fila.
    FOR v_irma IN
        SELECT ns.id
        FROM nfs_stage ns
        WHERE ns.fornecedor_cnpj = NEW.fornecedor_cnpj
          AND COALESCE(left(NULLIF(ns.itens->0->>'ncm',''), 4), '') = v_ncm4
          AND ns.id <> NEW.id
          AND ns.revisada_em IS NULL
          AND ns.motivo_descarte IS NULL
          AND ns.status NOT IN ('descartada','duplicata')
    LOOP
        PERFORM aplicar_regras_categorizacao_stage(v_irma.id);
    END LOOP;

    RETURN NEW;
END;
$function$;
