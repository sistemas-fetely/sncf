-- ============================================================================
-- Rename contas_pagar_documentos.conta_id → conta_pagar_id
-- ============================================================================
-- conta_id nesta tabela = FK para contas_pagar_receber.id (CPR pai).
-- Conflito com contas_pagar_receber.conta_id = FK para plano_contas.id.
-- Mesmo nome, semânticas opostas. Padrão: conta_pagar_id.
-- §3.5 do diagnóstico de nomenclatura 18/05/2026.
-- ============================================================================

ALTER TABLE public.contas_pagar_documentos
  RENAME COLUMN conta_id TO conta_pagar_id;
