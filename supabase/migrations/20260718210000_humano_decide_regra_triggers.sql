-- 🔵 SNCF
-- Espelho: triggers HUMANO-DECIDE-A-REGRA (origem do carimbo + upsert de confirmacao)
-- Aplicado no banco vivo em 18/07/2026 via Lovable Cloud SQL Editor
-- Destino: supabase/migrations/20260718210000_humano_decide_regra_triggers.sql via GitHub web

-- 1. BEFORE UPDATE: define revisao_origem quando o carimbo/edição vem do humano.
--    O motor sempre seta 'motor' explicitamente no próprio UPDATE; qualquer carimbo
--    sem origem explícita, ou edição de classificação sem trocar a origem, é humano.
CREATE OR REPLACE FUNCTION public.trg_nfs_stage_revisao_origem()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.revisada_em IS NOT NULL THEN
        IF NEW.revisao_origem IS NULL THEN
            NEW.revisao_origem := 'humano';
        ELSIF NEW.revisao_origem = OLD.revisao_origem
              AND (OLD.plano_contas_id IS DISTINCT FROM NEW.plano_contas_id
                   OR OLD.centro_custo_id IS DISTINCT FROM NEW.centro_custo_id) THEN
            -- humano corrigiu classificação de NF já revisada (inclusive carimbada pelo motor)
            NEW.revisao_origem := 'humano';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_nfs_stage_revisao_origem ON public.nfs_stage;
CREATE TRIGGER trg_nfs_stage_revisao_origem
    BEFORE UPDATE ON public.nfs_stage
    FOR EACH ROW EXECUTE FUNCTION public.trg_nfs_stage_revisao_origem();

-- 2. AFTER UPDATE: quando um HUMANO carimba (transição para revisada) ou corrige
--    a classificação de NF revisada, grava/atualiza a classificação confirmada.
--    Guard preventivo via ON CONFLICT (doutrina ROLLBACK-SILENCIOSO).
CREATE OR REPLACE FUNCTION public.trg_nfs_stage_confirma_classificacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_ncm4 text;
BEGIN
    -- só ação humana com classificação de plano presente e CNPJ conhecido
    IF NEW.revisada_em IS NULL
       OR NEW.revisao_origem IS DISTINCT FROM 'humano'
       OR NEW.plano_contas_id IS NULL
       OR NEW.fornecedor_cnpj IS NULL THEN
        RETURN NEW;
    END IF;

    -- só nos eventos relevantes: carimbo novo ou mudança de classificação
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

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_nfs_stage_confirma_classificacao ON public.nfs_stage;
CREATE TRIGGER trg_nfs_stage_confirma_classificacao
    AFTER UPDATE ON public.nfs_stage
    FOR EACH ROW EXECUTE FUNCTION public.trg_nfs_stage_confirma_classificacao();
