-- Migration espelho: Conciliação Bancária Fatia 2 — P1 regras + P2 pares
-- (aplicada em produção 17/07/2026 via SQL Editor; espelho via GitHub web
--  conforme doutrina MIGRATION-ESPELHO-VIA-GITHUB)
-- Homologada em produção no mesmo dia: 112 linhas classificadas por regra,
-- 23 pares de transferência confirmados (R$ 147.784,46).
-- NOTA: as 14 regras seedadas são DADO de dimensão editável (DIMENSÃO-VIA-
-- TABELA), vivem no banco e no CRUD /administrativo/extrato-regras.

-- ══════════════════════════════════════════════════════════════════
-- 1. Dimensão: regras de classificação automática (P1)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS regras_classificacao_extrato (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem smallint NOT NULL DEFAULT 100,
  ativo boolean NOT NULL DEFAULT true,
  conta_bancaria_id uuid NULL REFERENCES contas_bancarias(id),
  campo_alvo text NOT NULL DEFAULT 'descricao'
    CONSTRAINT regras_class_campo_check CHECK (campo_alvo = ANY (ARRAY['descricao'::text, 'contraparte_documento'::text, 'contraparte_nome'::text])),
  operador text NOT NULL DEFAULT 'contem'
    CONSTRAINT regras_class_operador_check CHECK (operador = ANY (ARRAY['contem'::text, 'comeca_com'::text, 'igual'::text, 'regex'::text])),
  padrao text NOT NULL,
  classe_destino text NOT NULL
    CONSTRAINT regras_class_classe_check CHECK (classe_destino = ANY (ARRAY[
      'tarifa_bancaria'::text, 'rendimento'::text, 'imposto'::text, 'ajuste_adquirencia'::text
    ])),
  tipo_meio_destino text NULL
    CONSTRAINT regras_class_meio_check CHECK (tipo_meio_destino IS NULL OR tipo_meio_destino = ANY (ARRAY[
      'pix'::text, 'cartao'::text, 'boleto'::text, 'ted'::text, 'tarifa'::text,
      'rendimento'::text, 'imposto'::text, 'transferencia'::text, 'outro'::text
    ])),
  descricao_regra text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE regras_classificacao_extrato ENABLE ROW LEVEL SECURITY;
CREATE POLICY regras_classificacao_extrato_all ON regras_classificacao_extrato
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_regras_class_updated_at
  BEFORE UPDATE ON regras_classificacao_extrato
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE movimentacoes_bancarias
  ADD COLUMN IF NOT EXISTS regra_aplicada_id uuid NULL REFERENCES regras_classificacao_extrato(id);

-- ══════════════════════════════════════════════════════════════════
-- 2. Motor P1: fn_regras_aplicar (única automação plena; idempotente)
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_regras_aplicar()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_classificadas int := 0;
BEGIN
  WITH regras AS (
    SELECT * FROM regras_classificacao_extrato WHERE ativo = true
  ),
  candidatas AS (
    SELECT m.id AS mov_id,
      (SELECT r.id FROM regras r
       WHERE (r.conta_bancaria_id IS NULL OR r.conta_bancaria_id = m.conta_bancaria_id)
         AND (
           CASE r.campo_alvo
             WHEN 'descricao' THEN
               CASE r.operador
                 WHEN 'contem'     THEN upper(coalesce(m.descricao,'')) LIKE '%' || upper(r.padrao) || '%'
                 WHEN 'comeca_com' THEN upper(coalesce(m.descricao,'')) LIKE upper(r.padrao) || '%'
                 WHEN 'igual'      THEN upper(coalesce(m.descricao,'')) = upper(r.padrao)
                 WHEN 'regex'      THEN coalesce(m.descricao,'') ~* r.padrao
               END
             WHEN 'contraparte_documento' THEN
               CASE r.operador
                 WHEN 'contem'     THEN coalesce(m.contraparte_documento,'') LIKE '%' || r.padrao || '%'
                 WHEN 'comeca_com' THEN coalesce(m.contraparte_documento,'') LIKE r.padrao || '%'
                 WHEN 'igual'      THEN coalesce(m.contraparte_documento,'') = r.padrao
                 WHEN 'regex'      THEN coalesce(m.contraparte_documento,'') ~* r.padrao
               END
             WHEN 'contraparte_nome' THEN
               CASE r.operador
                 WHEN 'contem'     THEN upper(coalesce(m.contraparte_nome,'')) LIKE '%' || upper(r.padrao) || '%'
                 WHEN 'comeca_com' THEN upper(coalesce(m.contraparte_nome,'')) LIKE upper(r.padrao) || '%'
                 WHEN 'igual'      THEN upper(coalesce(m.contraparte_nome,'')) = upper(r.padrao)
                 WHEN 'regex'      THEN coalesce(m.contraparte_nome,'') ~* r.padrao
               END
           END
         )
       ORDER BY r.ordem ASC, r.created_at ASC
       LIMIT 1) AS regra_id
    FROM movimentacoes_bancarias m
    WHERE m.classe IS NULL
  )
  UPDATE movimentacoes_bancarias m
  SET classe = r.classe_destino,
      classe_definida_por = 'regra_p1',
      regra_aplicada_id = r.id,
      tipo_meio = COALESCE(r.tipo_meio_destino, m.tipo_meio)
  FROM candidatas c
  JOIN regras_classificacao_extrato r ON r.id = c.regra_id
  WHERE m.id = c.mov_id
    AND c.regra_id IS NOT NULL;

  GET DIAGNOSTICS v_classificadas = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'classificadas', v_classificadas,
    'executado_em', now()
  );
END;
$function$;

-- ══════════════════════════════════════════════════════════════════
-- 3. Motor P2 de sugestão: view derivada (PREVISÃO-É-DERIVADA)
--    Documento próprio = CNPJ em unidades ativas (DIMENSÃO-VIA-TABELA)
-- ══════════════════════════════════════════════════════════════════
DROP VIEW IF EXISTS vw_pares_transferencia_sugeridos;
CREATE VIEW vw_pares_transferencia_sugeridos WITH (security_invoker = true) AS
WITH docs_proprios AS (
  SELECT regexp_replace(cnpj, '\D', '', 'g') AS doc
  FROM unidades
  WHERE ativa = true AND cnpj IS NOT NULL
),
abertas AS (
  SELECT m.id, m.conta_bancaria_id, m.data_transacao, m.valor, m.tipo,
         m.descricao, m.contraparte_nome, m.contraparte_documento,
         (m.contraparte_documento IN (SELECT doc FROM docs_proprios)) AS doc_proprio,
         (upper(coalesce(m.descricao,'') || ' ' || coalesce(m.contraparte_nome,'')) LIKE '%FETELY%') AS menciona_fetely
  FROM movimentacoes_bancarias m
  WHERE m.classe IS NULL
)
SELECT
  d.id  AS debito_id,
  c.id  AS credito_id,
  d.conta_bancaria_id AS conta_origem_id,
  c.conta_bancaria_id AS conta_destino_id,
  d.data_transacao    AS data_debito,
  c.data_transacao    AS data_credito,
  abs(d.valor)        AS valor,
  d.descricao         AS descricao_debito,
  c.descricao         AS descricao_credito,
  d.contraparte_nome  AS contraparte_debito,
  c.contraparte_nome  AS contraparte_credito,
  abs(c.data_transacao - d.data_transacao) AS dias_diferenca,
  CASE
    WHEN d.doc_proprio AND c.doc_proprio THEN 100
    WHEN (d.doc_proprio OR c.doc_proprio)
         AND abs(c.data_transacao - d.data_transacao) <= 1 THEN 90
    WHEN (d.doc_proprio OR c.doc_proprio) THEN 80
    WHEN (d.menciona_fetely OR c.menciona_fetely) THEN 70
    ELSE 60
  END AS score
FROM abertas d
JOIN abertas c
  ON d.tipo = 'debito'
 AND c.tipo = 'credito'
 AND d.conta_bancaria_id <> c.conta_bancaria_id
 AND abs(d.valor) = abs(c.valor)
 AND abs(c.data_transacao - d.data_transacao) <= 2
 AND (d.doc_proprio OR c.doc_proprio OR d.menciona_fetely OR c.menciona_fetely);

-- ══════════════════════════════════════════════════════════════════
-- 4. RPC P2: confirmar_par_transferencia (SISTEMA SUGERE / HUMANO DECIDE)
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.confirmar_par_transferencia(
  p_debito_id uuid,
  p_credito_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_deb movimentacoes_bancarias%ROWTYPE;
  v_cred movimentacoes_bancarias%ROWTYPE;
BEGIN
  SELECT * INTO v_deb FROM movimentacoes_bancarias WHERE id = p_debito_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Movimentação de débito não encontrada');
  END IF;

  SELECT * INTO v_cred FROM movimentacoes_bancarias WHERE id = p_credito_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Movimentação de crédito não encontrada');
  END IF;

  IF v_deb.classe IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Débito já classificado como ' || v_deb.classe);
  END IF;
  IF v_cred.classe IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Crédito já classificado como ' || v_cred.classe);
  END IF;
  IF v_deb.tipo <> 'debito' OR v_cred.tipo <> 'credito' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Tipos invertidos: primeiro parâmetro deve ser débito, segundo crédito');
  END IF;
  IF v_deb.conta_bancaria_id = v_cred.conta_bancaria_id THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Par exige contas distintas');
  END IF;
  IF abs(v_deb.valor) <> abs(v_cred.valor) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Valores divergem: ' || abs(v_deb.valor) || ' vs ' || abs(v_cred.valor));
  END IF;
  IF abs(v_cred.data_transacao - v_deb.data_transacao) > 5 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Datas muito distantes (' || abs(v_cred.data_transacao - v_deb.data_transacao) || ' dias) — verifique se é o mesmo dinheiro');
  END IF;

  UPDATE movimentacoes_bancarias
  SET classe = 'transferencia_interna',
      classe_definida_por = 'par_p2',
      par_transferencia_id = p_credito_id
  WHERE id = p_debito_id;

  UPDATE movimentacoes_bancarias
  SET classe = 'transferencia_interna',
      classe_definida_por = 'par_p2',
      par_transferencia_id = p_debito_id
  WHERE id = p_credito_id;

  RETURN jsonb_build_object('ok', true, 'debito_id', p_debito_id, 'credito_id', p_credito_id, 'valor', abs(v_deb.valor));
END;
$function$;
