-- 🔵 SNCF
-- Espelho: DDL HUMANO-DECIDE-A-REGRA (tabela classificacoes_confirmadas + nfs_stage.revisao_origem)
-- Aplicado no banco vivo em 18/07/2026 via Lovable Cloud SQL Editor
-- Destino: supabase/migrations/20260718200000_humano_decide_regra_ddl.sql via GitHub web

CREATE TABLE IF NOT EXISTS public.classificacoes_confirmadas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cnpj text NOT NULL,
    ncm_prefixo text NOT NULL DEFAULT '',
    plano_contas_id uuid NOT NULL REFERENCES public.plano_contas(id),
    centro_custo_id uuid REFERENCES public.centros_custo(id),
    valor_max_confirmado numeric(14,2) NOT NULL DEFAULT 0,
    confirmada_em timestamptz NOT NULL DEFAULT now(),
    confirmada_por uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_classif_confirmada_cnpj_ncm UNIQUE (cnpj, ncm_prefixo)
);

DROP TRIGGER IF EXISTS trg_classif_confirmadas_updated_at ON public.classificacoes_confirmadas;
CREATE TRIGGER trg_classif_confirmadas_updated_at
    BEFORE UPDATE ON public.classificacoes_confirmadas
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.classificacoes_confirmadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sel_classif_confirmadas ON public.classificacoes_confirmadas;
CREATE POLICY sel_classif_confirmadas ON public.classificacoes_confirmadas
    FOR SELECT TO authenticated USING (true);

ALTER TABLE public.nfs_stage
    ADD COLUMN IF NOT EXISTS revisao_origem text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'nfs_stage_revisao_origem_check'
    ) THEN
        ALTER TABLE public.nfs_stage
            ADD CONSTRAINT nfs_stage_revisao_origem_check
            CHECK (revisao_origem IS NULL OR revisao_origem IN ('humano','motor'));
    END IF;
END $$;

UPDATE public.nfs_stage
SET revisao_origem = 'humano'
WHERE revisada_em IS NOT NULL
  AND revisao_origem IS NULL;
