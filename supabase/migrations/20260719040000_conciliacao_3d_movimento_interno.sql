-- 🔵 SNCF
-- Espelho: Conciliacao Fatia 3-D peca 1 — classe movimento_interno + retarget APL/RES
-- Aplicado no banco vivo em 19/07/2026. CHECKs pelo censo real (CENSO-ANTES-DE-CHECK).

-- 1. CHECK de classe em movimentacoes_bancarias (censo: + aporte_investidor)
ALTER TABLE public.movimentacoes_bancarias
  DROP CONSTRAINT IF EXISTS movimentacoes_bancarias_classe_check;
ALTER TABLE public.movimentacoes_bancarias
  ADD CONSTRAINT movimentacoes_bancarias_classe_check CHECK (classe IS NULL OR classe = ANY (ARRAY[
      'tarifa_bancaria'::text, 'rendimento'::text, 'imposto'::text,
      'transferencia_interna'::text, 'ajuste_adquirencia'::text,
      'recebivel_titulo'::text, 'recebivel_cartao'::text,
      'despesa_cpr'::text, 'outro_classificado'::text,
      'aporte_investidor'::text,
      'movimento_interno'::text
  ]));

-- 2. CHECK de classe_destino nas regras (censo: + aporte_investidor)
ALTER TABLE public.regras_classificacao_extrato
  DROP CONSTRAINT IF EXISTS regras_class_classe_check;
ALTER TABLE public.regras_classificacao_extrato
  ADD CONSTRAINT regras_class_classe_check CHECK (classe_destino = ANY (ARRAY[
      'tarifa_bancaria'::text, 'rendimento'::text, 'imposto'::text,
      'ajuste_adquirencia'::text, 'aporte_investidor'::text,
      'movimento_interno'::text
  ]));

-- 3. Retarget das regras existentes: aplicacao e resgate = movimento interno
UPDATE public.regras_classificacao_extrato
SET classe_destino = 'movimento_interno',
    descricao_regra = 'Aplicacao/resgate automatico: principal entre contas proprias (nao e rendimento)'
WHERE padrao IN ('APL APLIC', 'RES APLIC')
  AND classe_destino = 'rendimento';

-- 4. Corrigir dados ja classificados pelo alvo antigo (debitos APL e creditos RES)
UPDATE public.movimentacoes_bancarias
SET classe = 'movimento_interno'
WHERE classe = 'rendimento'
  AND (descricao LIKE 'APL APLIC%' OR descricao LIKE 'RES APLIC%');
