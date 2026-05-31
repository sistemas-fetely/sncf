-- 🔵 SNCF — FASE 1 RECEBIMENTO / BACKEND (baixa de título via conciliação)
-- Idempotente. Smoke esperado: roda em produção sem erro.
-- Decisão: baixa opera SÓ no título (não cascateia pro CPR — sem vínculo confiável hoje;
-- título é a entidade real de recebível; avanço do pedido depende do título pago).

BEGIN;

-- 1) Vínculo título -> movimentação que o baixou (nullable = zero quebra), espelha padrão do CPR
ALTER TABLE public.titulo_a_receber
  ADD COLUMN IF NOT EXISTS movimentacao_baixa_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'titulo_a_receber_movimentacao_baixa_id_fkey'
      AND conrelid = 'public.titulo_a_receber'::regclass
  ) THEN
    ALTER TABLE public.titulo_a_receber
      ADD CONSTRAINT titulo_a_receber_movimentacao_baixa_id_fkey
      FOREIGN KEY (movimentacao_baixa_id)
      REFERENCES public.movimentacoes_bancarias(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_titulo_movimentacao_baixa
  ON public.titulo_a_receber (movimentacao_baixa_id)
  WHERE movimentacao_baixa_id IS NOT NULL;

-- 2) SUGESTÃO — dado um crédito no extrato, acha títulos candidatos. SÓ SUGERE, não age.
--    (movimentacoes_bancarias não tem parceiro; casamento é por valor + proximidade de data.)
CREATE OR REPLACE FUNCTION public.sugerir_titulos_para_credito(
  p_movimentacao_id uuid,
  p_janela_dias int DEFAULT 7
)
RETURNS TABLE (
  titulo_id uuid,
  numero_titulo text,
  cliente text,
  valor_atual numeric,
  data_vencimento_atual date,
  status text,
  diff_valor numeric,
  dias_distancia int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_valor numeric;
  v_data  date;
BEGIN
  SELECT m.valor, m.data_transacao INTO v_valor, v_data
  FROM movimentacoes_bancarias m WHERE m.id = p_movimentacao_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimentação % não encontrada', p_movimentacao_id USING ERRCODE = '02000';
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.numero_titulo,
    pc.razao_social,
    t.valor_atual,
    t.data_vencimento_atual,
    t.status,
    abs(t.valor_atual - abs(v_valor))::numeric        AS diff_valor,
    abs(t.data_vencimento_atual - v_data)::int        AS dias_distancia
  FROM titulo_a_receber t
  LEFT JOIN parceiros_comerciais pc ON pc.id = t.conta_id
  WHERE t.status IN (
    'aguardando_pagamento','aguardando_envio_bling','aguardando_emissao_nf',
    'vigente','vigente_parcial','vencido','vencido_suspenso','em_juridico','renegociado'
  )
  ORDER BY abs(t.valor_atual - abs(v_valor)) ASC,
           abs(t.data_vencimento_atual - v_data) ASC
  LIMIT 15;
END;
$function$;

-- 3) BAIXA por conciliação — opera só no título. Idempotente, FAIL-LOUD.
CREATE OR REPLACE FUNCTION public.baixar_titulo_conciliacao(
  p_titulo_id uuid,
  p_movimentacao_id uuid,
  p_data_pagamento timestamp with time zone DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_titulo  record;
  v_operador uuid;
  v_status_final text;
BEGIN
  v_operador := auth.uid();

  -- lock do título
  SELECT id, status, data_vencimento_atual, numero_titulo, valor_atual
  INTO v_titulo
  FROM titulo_a_receber WHERE id = p_titulo_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Título % não encontrado', p_titulo_id USING ERRCODE = '02000';
  END IF;

  -- valida que a movimentação existe (FAIL-LOUD)
  IF NOT EXISTS (SELECT 1 FROM movimentacoes_bancarias WHERE id = p_movimentacao_id) THEN
    RAISE EXCEPTION 'Movimentação % não encontrada', p_movimentacao_id USING ERRCODE = '02000';
  END IF;

  -- idempotência: já baixado
  IF v_titulo.status IN ('pago','pago_com_atraso','pago_judicial') THEN
    RETURN jsonb_build_object(
      'ok', true, 'idempotente', true,
      'titulo_id', p_titulo_id, 'numero_titulo', v_titulo.numero_titulo,
      'mensagem', 'Título já estava baixado'
    );
  END IF;

  -- pago ou pago_com_atraso conforme a data
  v_status_final := CASE
    WHEN p_data_pagamento::date > v_titulo.data_vencimento_atual THEN 'pago_com_atraso'
    ELSE 'pago'
  END;

  UPDATE titulo_a_receber
  SET status = v_status_final,
      data_pagamento = p_data_pagamento,
      movimentacao_baixa_id = p_movimentacao_id,
      subestado_atraso = 'em_dia',
      updated_at = now()
  WHERE id = p_titulo_id;

  -- marca a movimentação como conciliada
  UPDATE movimentacoes_bancarias
  SET conciliado = true,
      conciliado_em = now(),
      conciliado_por = v_operador
  WHERE id = p_movimentacao_id;

  -- evento na timeline do título
  INSERT INTO evento_titulo (titulo_id, tipo_evento, ator, origem, payload)
  VALUES (
    p_titulo_id, 'BAIXA_TOTAL',
    COALESCE(v_operador::text, 'sistema'), 'CONCILIACAO',
    jsonb_build_object(
      'movimentacao_id', p_movimentacao_id,
      'valor', v_titulo.valor_atual,
      'data_pagamento', p_data_pagamento,
      'status_resultante', v_status_final
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'titulo_id', p_titulo_id,
    'numero_titulo', v_titulo.numero_titulo,
    'status', v_status_final,
    'movimentacao_id', p_movimentacao_id,
    'data_pagamento', p_data_pagamento
  );
END;
$function$;

COMMIT;
