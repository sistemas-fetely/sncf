-- ============================================================
-- FASE 1 — Despesas Gerenciais via NF Stage
-- Aplicada no banco vivo em 04/07/2026 (Lovable SQL Editor).
-- Este arquivo é o espelho versionado (DOC≠ESTADO fechado).
-- Conteúdo:
--   M1: nfs_stage.centro_custo_id + contas_pagar_receber.competencia
--   M2: fn_propagar_categoria_por_cnpj — herda plano+centro,
--       fallback default do parceiro (hierarquia Parceiro -> NF)
--   M3: fn_nf_propagar_para_tudo — propaga plano+centro nos 4 pontos,
--       semântica COALESCE (NF sobrepõe o preenchido, nunca apaga com NULL);
--       trigger trg_nf_verdade_absoluta estendido para UPDATE OF centro_custo_id
--   M4: vw_movimentacoes_gerencial (competência derivada, security_invoker)
-- ============================================================

-- M1 — Colunas novas
ALTER TABLE public.nfs_stage
  ADD COLUMN IF NOT EXISTS centro_custo_id uuid REFERENCES public.centros_custo(id);

ALTER TABLE public.contas_pagar_receber
  ADD COLUMN IF NOT EXISTS competencia date;

COMMENT ON COLUMN public.contas_pagar_receber.competencia IS
  'Competência gerencial (1º dia do mês). NULL = derivada de nf_data_emissao/data_compra/data_vencimento na view.';

-- M2 — Herança no insert com hierarquia Parceiro -> NF
CREATE OR REPLACE FUNCTION public.fn_propagar_categoria_por_cnpj()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Fonte 1: última NF do mesmo CNPJ (herda plano E centro, só o que faltar)
  IF NEW.fornecedor_cnpj IS NOT NULL
     AND (NEW.plano_contas_id IS NULL OR NEW.centro_custo_id IS NULL) THEN
    SELECT COALESCE(NEW.plano_contas_id, s.plano_contas_id),
           COALESCE(NEW.centro_custo_id, s.centro_custo_id)
      INTO NEW.plano_contas_id, NEW.centro_custo_id
      FROM nfs_stage s
     WHERE s.fornecedor_cnpj = NEW.fornecedor_cnpj
       AND (s.plano_contas_id IS NOT NULL OR s.centro_custo_id IS NOT NULL)
       AND s.status != 'descartada'
       AND s.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
     ORDER BY s.created_at DESC
     LIMIT 1;
  END IF;

  -- Fonte 2 (fallback): default do PARCEIRO (Parceiro é base, NF sobrepõe)
  -- NEW.parceiro_id já resolvido: trg_nf_stage_resolver_parceiro roda antes ('n' < 'p')
  IF NEW.parceiro_id IS NOT NULL
     AND (NEW.plano_contas_id IS NULL OR NEW.centro_custo_id IS NULL) THEN
    SELECT COALESCE(NEW.plano_contas_id, p.plano_contas_id),
           COALESCE(NEW.centro_custo_id, p.centro_custo_id)
      INTO NEW.plano_contas_id, NEW.centro_custo_id
      FROM parceiros_comerciais p
     WHERE p.id = NEW.parceiro_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- M3 — Propagação no update (4 pontos) + trigger estendido
CREATE OR REPLACE FUNCTION public.fn_nf_propagar_para_tudo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_conta_pagar_id uuid;
  v_grupo_id uuid;
BEGIN
  -- Dispara se plano OU centro mudou (antes: só plano)
  IF (OLD.plano_contas_id IS NOT DISTINCT FROM NEW.plano_contas_id)
     AND (OLD.centro_custo_id IS NOT DISTINCT FROM NEW.centro_custo_id) THEN
    RETURN NEW;
  END IF;
  IF NEW.plano_contas_id IS NULL AND NEW.centro_custo_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.conta_pagar_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_conta_pagar_id := NEW.conta_pagar_id;
  SELECT parcela_grupo_id INTO v_grupo_id
    FROM contas_pagar_receber
   WHERE id = v_conta_pagar_id;

  -- NF é verdade absoluta para campos PREENCHIDOS; nunca apaga com NULL
  -- 1) Conta a Pagar
  UPDATE contas_pagar_receber
     SET plano_contas_id = COALESCE(NEW.plano_contas_id, plano_contas_id),
         centro_custo_id = COALESCE(NEW.centro_custo_id, centro_custo_id),
         updated_at = now()
   WHERE id = v_conta_pagar_id;

  -- 2) Irmãs do parcela_grupo
  IF v_grupo_id IS NOT NULL THEN
    UPDATE contas_pagar_receber
       SET plano_contas_id = COALESCE(NEW.plano_contas_id, plano_contas_id),
           centro_custo_id = COALESCE(NEW.centro_custo_id, centro_custo_id),
           updated_at = now()
     WHERE parcela_grupo_id = v_grupo_id
       AND id != v_conta_pagar_id
       AND status NOT IN ('cancelado');
  END IF;

  -- 3) Lançamentos cartão
  UPDATE fatura_cartao_lancamentos
     SET plano_contas_id = COALESCE(NEW.plano_contas_id, plano_contas_id),
         centro_custo_id = COALESCE(NEW.centro_custo_id, centro_custo_id),
         updated_at = now()
   WHERE conta_pagar_id = v_conta_pagar_id;

  -- 4) Movimentações bancárias (sem updated_at — padrão da função original)
  UPDATE movimentacoes_bancarias
     SET plano_contas_id = COALESCE(NEW.plano_contas_id, plano_contas_id),
         centro_custo_id = COALESCE(NEW.centro_custo_id, centro_custo_id),
         categoria_inconsistente = false,
         inconsistencia_motivo = NULL
   WHERE conta_pagar_id = v_conta_pagar_id;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_nf_verdade_absoluta ON public.nfs_stage;
CREATE TRIGGER trg_nf_verdade_absoluta
AFTER UPDATE OF plano_contas_id, centro_custo_id ON public.nfs_stage
FOR EACH ROW EXECUTE FUNCTION fn_nf_propagar_para_tudo();

-- M4 — View gerencial (competência derivada)
DROP VIEW IF EXISTS public.vw_movimentacoes_gerencial;
CREATE VIEW public.vw_movimentacoes_gerencial
WITH (security_invoker = true) AS
SELECT
  cpr.id,
  cpr.tipo,
  COALESCE(
    cpr.competencia,
    date_trunc('month', cpr.nf_data_emissao)::date,
    date_trunc('month', cpr.data_compra)::date,
    date_trunc('month', cpr.data_vencimento)::date
  ) AS competencia,
  cpr.descricao,
  cpr.fornecedor_cliente,
  cpr.parceiro_id,
  cpr.valor,
  cpr.status,
  cpr.data_vencimento,
  cpr.data_pagamento,
  cpr.plano_contas_id,
  pc.nome AS plano_contas_nome,
  cpr.centro_custo_id,
  cc.nome AS centro_custo_nome,
  cpr.nf_numero,
  cpr.categoria_confirmada,
  (cpr.plano_contas_id IS NOT NULL AND cpr.centro_custo_id IS NOT NULL) AS classificacao_completa
FROM contas_pagar_receber cpr
LEFT JOIN plano_contas pc ON pc.id = cpr.plano_contas_id
LEFT JOIN centros_custo cc ON cc.id = cpr.centro_custo_id
WHERE cpr.status <> 'cancelado'
  AND cpr.deleted_at IS NULL;

-- M6 — Propagação no VÍNCULO (hotfix pós-validação, mesma sessão 04/07)
-- Cobre o caminho "classificou -> vinculou": quando conta_pagar_id nasce na stage,
-- a classificação existente viaja para a CPR. Imune a republicação Lovable
-- (lição do rastreio Shopify: lógica crítica mora no banco).
CREATE OR REPLACE FUNCTION public.fn_nf_vinculo_propaga_classificacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.conta_pagar_id IS NOT NULL
     AND (OLD.conta_pagar_id IS DISTINCT FROM NEW.conta_pagar_id)
     AND (NEW.plano_contas_id IS NOT NULL OR NEW.centro_custo_id IS NOT NULL) THEN
    UPDATE contas_pagar_receber
       SET plano_contas_id = COALESCE(NEW.plano_contas_id, plano_contas_id),
           centro_custo_id = COALESCE(NEW.centro_custo_id, centro_custo_id),
           updated_at = now()
     WHERE id = NEW.conta_pagar_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_nf_vinculo_propaga ON public.nfs_stage;
CREATE TRIGGER trg_nf_vinculo_propaga
AFTER INSERT OR UPDATE OF conta_pagar_id ON public.nfs_stage
FOR EACH ROW EXECUTE FUNCTION fn_nf_vinculo_propaga_classificacao();