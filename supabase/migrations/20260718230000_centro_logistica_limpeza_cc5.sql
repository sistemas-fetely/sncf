-- 🔵 SNCF
-- Espelho: centro de custo Operacao & Logistica + limpeza do duplicado CC5
-- Aplicado no banco vivo em 18/07/2026 via Lovable Cloud SQL Editor
-- Destino: supabase/migrations/20260718230000_centro_logistica_limpeza_cc5.sql via GitHub web
-- Contexto: decisao Flavio — frete/armazenagem (Icaro, XPM, SJB) recebe centro proprio.
-- CC5 "Operações & Logística" (seed abril) tinha ZERO referencias — deletado.
-- Licao SEED-E-HIPOTESE: perfilar dimensao existente antes de semear valor novo.

INSERT INTO public.centros_custo (codigo, nome)
VALUES ('logistica', 'Operação & Logística')
ON CONFLICT (codigo) DO NOTHING;

DELETE FROM public.centros_custo
WHERE id = '81d05f52-7246-4191-bd7a-b5734ecd545e'
  AND codigo = 'CC5';
