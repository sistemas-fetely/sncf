-- Migration espelho: Conciliação Bancária Fatia 1 (aplicada em produção 17/07/2026 via SQL Editor)
-- Mapa_Fluxos_Conciliacao_Bancaria_v1 — decisões D1 (payment_reference) e D3 (extensão)

-- 1. Extensão de movimentacoes_bancarias (inbox de conciliação)
ALTER TABLE movimentacoes_bancarias
  ADD COLUMN IF NOT EXISTS classe text NULL
    CONSTRAINT movimentacoes_bancarias_classe_check CHECK (classe IS NULL OR classe = ANY (ARRAY[
      'tarifa_bancaria'::text, 'rendimento'::text, 'imposto'::text,
      'transferencia_interna'::text, 'ajuste_adquirencia'::text,
      'recebivel_titulo'::text, 'recebivel_cartao'::text,
      'despesa_cpr'::text, 'outro_classificado'::text
    ])),
  ADD COLUMN IF NOT EXISTS classe_definida_por text NULL
    CONSTRAINT movimentacoes_bancarias_classe_por_check CHECK (classe_definida_por IS NULL OR classe_definida_por = ANY (ARRAY[
      'regra_p1'::text, 'par_p2'::text, 'match_p3'::text, 'match_p4'::text, 'manual_p5'::text
    ])),
  ADD COLUMN IF NOT EXISTS tipo_meio text NULL
    CONSTRAINT movimentacoes_bancarias_tipo_meio_check CHECK (tipo_meio IS NULL OR tipo_meio = ANY (ARRAY[
      'pix'::text, 'cartao'::text, 'boleto'::text, 'ted'::text, 'tarifa'::text,
      'rendimento'::text, 'imposto'::text, 'transferencia'::text, 'outro'::text
    ])),
  ADD COLUMN IF NOT EXISTS contraparte_nome text NULL,
  ADD COLUMN IF NOT EXISTS contraparte_documento text NULL,
  ADD COLUMN IF NOT EXISTS referencia_pedido text NULL,
  ADD COLUMN IF NOT EXISTS par_transferencia_id uuid NULL REFERENCES movimentacoes_bancarias(id),
  ADD COLUMN IF NOT EXISTS data_hora timestamptz NULL,
  ADD COLUMN IF NOT EXISTS fonte_importacao_id uuid NULL;

CREATE INDEX IF NOT EXISTS idx_mov_bancarias_inbox_aberto
  ON movimentacoes_bancarias (conta_bancaria_id, data_transacao) WHERE classe IS NULL;
CREATE INDEX IF NOT EXISTS idx_mov_bancarias_contraparte_doc
  ON movimentacoes_bancarias (contraparte_documento) WHERE contraparte_documento IS NOT NULL;

-- 2. CHECK de origem ampliado (novas fontes do Mapa de Conciliação)
ALTER TABLE movimentacoes_bancarias DROP CONSTRAINT IF EXISTS movimentacoes_bancarias_origem_check;
ALTER TABLE movimentacoes_bancarias ADD CONSTRAINT movimentacoes_bancarias_origem_check CHECK (origem = ANY (ARRAY[
  'ofx'::text, 'csv_itau'::text, 'csv_safra'::text, 'manual'::text, 'cpr'::text,
  'conta_pagar'::text, 'retorno_safra'::text,
  'safra_lancamentos'::text, 'safrapay_vendas'::text, 'safrapay_liquidacao'::text,
  'safrapay_ajustes'::text, 'safrapay_agenda'::text, 'itau_pagamentos'::text,
  'mp_settlement'::text, 'mp_release'::text, 'mp_withdraw'::text, 'mp_collection'::text
]));

-- 3. Log de importações de extrato
CREATE TABLE IF NOT EXISTS extrato_importacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_bancaria_id uuid NULL REFERENCES contas_bancarias(id),
  fonte_tipo text NOT NULL
    CONSTRAINT extrato_importacoes_fonte_check CHECK (fonte_tipo = ANY (ARRAY[
      'ofx'::text, 'safra_lancamentos'::text, 'safrapay_vendas'::text,
      'safrapay_liquidacao'::text, 'safrapay_ajustes'::text, 'safrapay_agenda'::text,
      'itau_pagamentos'::text, 'mp_settlement'::text, 'mp_release'::text,
      'mp_withdraw'::text, 'mp_collection'::text
    ])),
  nome_arquivo text NOT NULL,
  periodo_inicio date NULL,
  periodo_fim date NULL,
  status text NOT NULL DEFAULT 'processando'
    CONSTRAINT extrato_importacoes_status_check CHECK (status = ANY (ARRAY[
      'processando'::text, 'concluida'::text, 'erro'::text
    ])),
  linhas_lidas integer NOT NULL DEFAULT 0,
  linhas_novas integer NOT NULL DEFAULT 0,
  linhas_enriquecidas integer NOT NULL DEFAULT 0,
  linhas_duplicadas integer NOT NULL DEFAULT 0,
  divergencia_saldo numeric NULL,
  erro_detalhe text NULL,
  importado_por uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE extrato_importacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY extrato_importacoes_all ON extrato_importacoes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_extrato_importacoes_updated_at
  BEFORE UPDATE ON extrato_importacoes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. Ponte MP<->pedido Shopify (decisão D1)
ALTER TABLE shopify_pedidos ADD COLUMN IF NOT EXISTS payment_reference text NULL;
CREATE INDEX IF NOT EXISTS idx_shopify_pedidos_payment_reference
  ON shopify_pedidos (payment_reference) WHERE payment_reference IS NOT NULL;
