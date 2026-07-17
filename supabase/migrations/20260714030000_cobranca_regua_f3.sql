-- Migration espelho: COB-F3 Régua de Cobrança (aplicada em produção 14/07/2026 via SQL Editor)
-- Reconstruída do banco vivo em 17/07/2026 (pg_get_functiondef / pg_get_viewdef / information_schema)
-- Inclui fixes da sessão 16/07 já incorporados na função (FIX A12: cartao LIKE)
-- NOTA: seeds de regua_cobranca_etapas (9 etapas + templates) são DADO de dimensão
-- editável (DIMENSÃO-VIA-TABELA), vivem no banco e não nesta migration.

-- ══════════════════════════════════════════════════════════════════
-- 1. Dimensão: etapas da régua
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS regua_cobranca_etapas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  ordem smallint NOT NULL,
  dias_offset smallint NOT NULL,
  perfil_cadencia text NOT NULL
    CONSTRAINT regua_cobranca_etapas_perfil_cadencia_check CHECK (perfil_cadencia = ANY (ARRAY['padrao'::text, 'bandeira_amarela'::text, 'vip'::text])),
  canal_sugerido text NOT NULL
    CONSTRAINT regua_cobranca_etapas_canal_sugerido_check CHECK (canal_sugerido = ANY (ARRAY['email'::text, 'whatsapp'::text, 'telefone'::text, 'carta'::text, 'cartorio'::text, 'advogado'::text])),
  descricao_acao text NOT NULL,
  template_mensagem text,
  responsavel_default text,
  requer_aprovacao boolean NOT NULL DEFAULT false,
  custo_externo_previsto numeric,
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT regua_cobranca_etapas_codigo_perfil_cadencia_dias_offset_key UNIQUE (codigo, perfil_cadencia, dias_offset)
);

ALTER TABLE regua_cobranca_etapas ENABLE ROW LEVEL SECURITY;
CREATE POLICY regua_cobranca_etapas_all ON regua_cobranca_etapas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_regua_etapas_updated_at
  BEFORE UPDATE ON regua_cobranca_etapas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ══════════════════════════════════════════════════════════════════
-- 2. Log append-only de ações da régua
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS regua_cobranca_acoes_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo_id uuid NOT NULL REFERENCES titulo_a_receber(id),
  etapa_codigo text NOT NULL,
  perfil_usado text NOT NULL,
  canal_efetivo text,
  mensagem_snapshot text,
  resultado text NOT NULL
    CONSTRAINT regua_cobranca_acoes_log_resultado_check CHECK (resultado = ANY (ARRAY['enviada'::text, 'pulada'::text, 'pausou_regua'::text, 'abriu_renegociacao'::text])),
  observacao text,
  executada_por uuid,
  executada_em timestamptz NOT NULL DEFAULT now(),
  dias_offset smallint
);

ALTER TABLE regua_cobranca_acoes_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY regua_cobranca_acoes_log_all ON regua_cobranca_acoes_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════════
-- 3. CHECK de subestado_atraso em titulo_a_receber (substituído na F3)
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE titulo_a_receber DROP CONSTRAINT IF EXISTS titulo_a_receber_subestado_atraso_check;
ALTER TABLE titulo_a_receber ADD CONSTRAINT titulo_a_receber_subestado_atraso_check
  CHECK (subestado_atraso = ANY (ARRAY['em_dia'::text, 'lembrete_amistoso'::text, 'cobranca_ativa'::text, 'cobranca_formal'::text, 'pre_juridico'::text, 'notificacao_extrajudicial'::text, 'protesto_solicitado'::text, 'juridico'::text]));

-- ══════════════════════════════════════════════════════════════════
-- 4. Motor: fn_regua_materializar (ESTADO-MATERIALIZA-EM-SQL)
--    Extraída do banco vivo — inclui FIX A12 (cartao LIKE)
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_regua_materializar()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
  v_avancados int := 0;
  v_flags int := 0;
BEGIN
  -- ── 1. Subestado + próxima ação (títulos cobráveis, ativos, não pausados) ──
  WITH ativos AS (
    SELECT t.id, t.subestado_atraso, t.data_vencimento_atual,
      (CURRENT_DATE - t.data_vencimento_atual) AS dias,
      CASE WHEN t.flag_bandeira_amarela THEN 'bandeira_amarela'
           WHEN t.vip_relacionamento THEN 'vip'
           ELSE 'padrao' END AS perfil
    FROM titulo_a_receber t
    WHERE t.status NOT IN ('pago','cancelado','cancelado_recuperacao')
      AND t.tipo_pagamento NOT LIKE 'cartao%' -- FIX A12: exclui todas as variantes de cartão (C1)
      AND t.pausa_regua_automatica = false
  ), com_perfil AS (
    -- fallback: se o perfil do título não tem linhas na dimensão, usa padrao
    SELECT a.*,
      CASE WHEN EXISTS (
        SELECT 1 FROM regua_cobranca_etapas e
        WHERE e.perfil_cadencia = a.perfil AND e.ativa
      ) THEN a.perfil ELSE 'padrao' END AS perfil_efetivo
    FROM ativos a
  ), estagio AS (
    -- etapa de atraso aplicável: maior dias_offset positivo <= dias
    SELECT cp.id, cp.dias, cp.subestado_atraso, cp.data_vencimento_atual, cp.perfil_efetivo,
      (SELECT e.codigo FROM regua_cobranca_etapas e
       WHERE e.perfil_cadencia = cp.perfil_efetivo AND e.ativa
         AND e.dias_offset >= 1 AND e.dias_offset <= cp.dias
       ORDER BY e.dias_offset DESC LIMIT 1) AS novo_subestado
    FROM com_perfil cp
  ), proxima AS (
    -- próxima ação = menor data (venc + offset) de etapa ativa AINDA NÃO logada para o título
    SELECT es.id, es.dias, es.subestado_atraso,
      COALESCE(es.novo_subestado, 'em_dia') AS subestado_alvo,
      (SELECT MIN(es.data_vencimento_atual + e.dias_offset)
       FROM regua_cobranca_etapas e
       WHERE e.perfil_cadencia = es.perfil_efetivo AND e.ativa
         AND NOT EXISTS (
           SELECT 1 FROM regua_cobranca_acoes_log l
           WHERE l.titulo_id = es.id
             AND l.etapa_codigo = e.codigo
             AND l.dias_offset = e.dias_offset
         )
      ) AS proxima_acao
    FROM estagio es
  )
  UPDATE titulo_a_receber t
  SET subestado_atraso = p.subestado_alvo,
      data_proxima_acao_regua = p.proxima_acao
  FROM proxima p
  WHERE t.id = p.id
    AND (t.subestado_atraso IS DISTINCT FROM p.subestado_alvo
         OR t.data_proxima_acao_regua IS DISTINCT FROM p.proxima_acao);
  GET DIAGNOSTICS v_avancados = ROW_COUNT;

  -- ── 2. Flag grupo econômico (C2): recalculada SÓ aqui ──
  -- Escopo do grupo: grupo_economico_id; parceiro sem grupo => escopo é o próprio parceiro
  WITH escopo AS (
    SELECT t.id AS titulo_id,
      COALESCE(pc.grupo_economico_id::text, 'p:' || pc.id::text) AS chave_grupo
    FROM titulo_a_receber t
    JOIN contas_pagar_receber cpr ON cpr.id = t.conta_id
    JOIN parceiros_comerciais pc ON pc.id = cpr.parceiro_id
  ), grupos_ruins AS (
    SELECT DISTINCT e.chave_grupo
    FROM escopo e
    JOIN titulo_a_receber t ON t.id = e.titulo_id
    WHERE t.subestado_atraso IN ('pre_juridico','notificacao_extrajudicial','protesto_solicitado','juridico')
      AND t.status NOT IN ('pago','cancelado','cancelado_recuperacao')
  )
  UPDATE titulo_a_receber t
  SET flag_grupo_economico_inadimplente = (gr.chave_grupo IS NOT NULL)
  FROM escopo e
  LEFT JOIN grupos_ruins gr ON gr.chave_grupo = e.chave_grupo
  WHERE t.id = e.titulo_id
    AND t.flag_grupo_economico_inadimplente IS DISTINCT FROM (gr.chave_grupo IS NOT NULL);
  GET DIAGNOSTICS v_flags = ROW_COUNT;

  RETURN jsonb_build_object('ok', true,
    'titulos_atualizados', v_avancados,
    'flags_grupo_atualizadas', v_flags,
    'executado_em', now());
END;
$function$;

-- ══════════════════════════════════════════════════════════════════
-- 5. RPC: renegociar_titulo (modalidades 2=parcelamento, 3=troca instrumento)
--    Extraída do banco vivo
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.renegociar_titulo(
  p_titulo_id uuid,
  p_modalidade smallint,
  p_justificativa text,
  p_parcelas jsonb,
  p_novo_tipo_pagamento text DEFAULT NULL::text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
  v_orig titulo_a_receber%ROWTYPE;
  v_n int; v_i int := 0; v_p jsonb;
  v_filhos uuid[] := '{}';
  v_novo_id uuid; v_tipo_pg text;
BEGIN
  SELECT * INTO v_orig FROM titulo_a_receber WHERE id = p_titulo_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Título não encontrado');
  END IF;
  IF v_orig.status IN ('pago','cancelado','cancelado_recuperacao') THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Título já encerrado (' || v_orig.status || ') — não pode ser renegociado');
  END IF;
  IF p_modalidade NOT IN (2, 3) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Modalidade inválida. Use 2 (parcelamento) ou 3 (troca de instrumento). Prorrogação simples usa o fluxo próprio do boleto.');
  END IF;
  IF length(coalesce(p_justificativa, '')) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Justificativa obrigatória (mínimo 10 caracteres)');
  END IF;
  v_n := jsonb_array_length(coalesce(p_parcelas, '[]'::jsonb));
  IF v_n < 1 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Informe ao menos uma parcela');
  END IF;
  IF p_modalidade = 3 AND v_n <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Troca de instrumento gera exatamente 1 título novo');
  END IF;
  IF p_modalidade = 3 AND coalesce(p_novo_tipo_pagamento, '') NOT IN ('pix','transferencia') THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Troca de instrumento exige novo tipo: pix ou transferencia');
  END IF;
  FOR v_p IN SELECT * FROM jsonb_array_elements(p_parcelas) LOOP
    IF (v_p->>'valor')::numeric <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'Parcela com valor inválido');
    END IF;
    IF (v_p->>'data_vencimento')::date <= CURRENT_DATE THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'Vencimento de parcela deve ser futuro');
    END IF;
  END LOOP;
  v_tipo_pg := CASE WHEN p_modalidade = 3 THEN p_novo_tipo_pagamento ELSE v_orig.tipo_pagamento END;

  -- ── Encerra o original (terminal, nunca volta, nunca recebe pagamento) ──
  UPDATE titulo_a_receber
  SET status = 'cancelado_recuperacao',
      modalidade_renegociacao = p_modalidade,
      justificativa_renegociacao = p_justificativa,
      -- boleto vivo no Safra precisa morrer via remessa de baixa,
      -- senão o cliente paga boleto de título cancelado:
      boleto_status = CASE WHEN boleto_status = 'registrado' THEN 'baixa_solicitada' ELSE boleto_status END
  WHERE id = p_titulo_id;

  -- ── Filhos nascem pareados (mesma CPR/pedido/NF do original) ──
  FOR v_p IN SELECT * FROM jsonb_array_elements(p_parcelas) LOOP
    v_i := v_i + 1;
    INSERT INTO titulo_a_receber (
      numero_titulo, conta_id, pedido_id, nf_id, valor_bruto,
      data_vencimento_original, data_vencimento_atual,
      numero_parcela, total_parcelas, tipo_pagamento, status,
      titulo_renegociado_origem_id, forma_pagamento_id
    ) VALUES (
      v_orig.numero_titulo || '-R' || v_i,
      v_orig.conta_id, v_orig.pedido_id, v_orig.nf_id,
      (v_p->>'valor')::numeric,
      (v_p->>'data_vencimento')::date, (v_p->>'data_vencimento')::date,
      v_i, v_n, v_tipo_pg, 'pendente',
      v_orig.id,
      CASE WHEN p_modalidade = 2 THEN v_orig.forma_pagamento_id ELSE NULL END
    ) RETURNING id INTO v_novo_id;
    v_filhos := array_append(v_filhos, v_novo_id);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'modalidade', p_modalidade, 'filhos', to_jsonb(v_filhos));
END;
$function$;

-- ══════════════════════════════════════════════════════════════════
-- 6. vw_titulos_cobranca v4 (+campos régua) — extraída do banco vivo
-- ══════════════════════════════════════════════════════════════════
DROP VIEW IF EXISTS vw_titulos_cobranca;
CREATE VIEW vw_titulos_cobranca WITH (security_invoker = true) AS
SELECT t.id, t.numero_titulo, t.numero_parcela, t.total_parcelas, t.eh_entrada, t.created_at,
  t.status AS status_real, t.tipo_pagamento, t.boleto_status, t.boleto_codigo_rejeicao,
  CASE
    WHEN t.status = ANY (ARRAY['cancelado'::text, 'cancelado_recuperacao'::text]) THEN 'cancelado'::text
    WHEN t.status = 'pago'::text THEN
      CASE
        WHEN COALESCE(t.data_pagamento_banco::date, t.data_pagamento::date) <= t.data_vencimento_original THEN 'pago'::text
        WHEN t.subestado_atraso = 'juridico'::text THEN 'pago_judicial'::text
        WHEN COALESCE(t.data_pagamento_banco, t.data_pagamento) IS NULL THEN 'pago'::text
        ELSE 'pago_com_atraso'::text
      END
    WHEN t.data_vencimento_atual < CURRENT_DATE THEN 'atrasado'::text
    WHEN t.data_vencimento_atual = CURRENT_DATE THEN 'vence_hoje'::text
    ELSE 'a_vencer'::text
  END AS status_gestao,
  CASE
    WHEN (t.status <> ALL (ARRAY['pago'::text, 'cancelado'::text, 'cancelado_recuperacao'::text]))
      AND t.data_vencimento_atual < CURRENT_DATE
    THEN CURRENT_DATE - t.data_vencimento_atual ELSE 0
  END AS dias_atraso,
  (t.data_pagamento IS NOT NULL OR t.data_pagamento_banco IS NOT NULL)
    AND (t.status <> ALL (ARRAY['pago'::text, 'cancelado'::text, 'cancelado_recuperacao'::text]))
    OR t.status = 'pago'::text AND t.data_pagamento IS NULL AND t.data_pagamento_banco IS NULL
    AS inconsistencia_pagamento,
  t.valor_bruto, COALESCE(t.valor_atual, t.valor_bruto) AS valor_efetivo,
  t.valor_juros, t.valor_multa, t.valor_desconto,
  t.data_vencimento_original, t.data_vencimento_atual, t.data_liquidacao_prevista,
  COALESCE(t.data_pagamento_banco::date, t.data_pagamento::date) AS data_liquidacao_real,
  t.data_pagamento, t.data_pagamento_banco,
  t.linha_digitavel, t.nosso_numero_seq, t.boleto_enviado_em, t.email_cobranca_enviado_em,
  t.data_proxima_acao_regua, t.pausa_regua_automatica, t.subestado_atraso,
  t.vip_relacionamento, t.flag_bandeira_amarela, t.flag_grupo_economico_inadimplente,
  t.modalidade_renegociacao, t.titulo_renegociado_origem_id,
  t.reemissao_nova_data, t.reemissao_novo_valor, t.reemissao_motivo, t.reemissao_aplicada_em,
  t.prorrogacao_nova_data, t.prorrogacao_solicitada_em,
  t.conta_id, t.pedido_id, t.nf_id, t.remessa_safra_id, t.banco_recebimento_id,
  cpr.parceiro_id,
  pc.razao_social AS parceiro_razao_social,
  pc.nome_fantasia AS parceiro_nome_fantasia,
  pc.cnpj AS parceiro_cnpj,
  pc.email_cobranca AS parceiro_email_cobranca,
  pc.email AS parceiro_email,
  ped.id_externo AS pedido_id_externo,
  ped.estagio AS pedido_estagio,
  nf.numero AS nf_numero,
  br.nome AS banco_nome
FROM titulo_a_receber t
JOIN contas_pagar_receber cpr ON cpr.id = t.conta_id
LEFT JOIN parceiros_comerciais pc ON pc.id = cpr.parceiro_id
LEFT JOIN pedidos ped ON ped.id = t.pedido_id
LEFT JOIN nfs_emitidas nf ON nf.id = t.nf_id
LEFT JOIN banco_recebimento br ON br.id = t.banco_recebimento_id;

-- ══════════════════════════════════════════════════════════════════
-- 7. pg_cron: materializador diário 03:00 BRT (06:00 UTC)
-- ══════════════════════════════════════════════════════════════════
SELECT cron.schedule('regua-materializar-diario', '0 6 * * *', $$SELECT fn_regua_materializar()$$);
