DROP VIEW IF EXISTS public.vw_fluxo_futuro_investimento CASCADE;

CREATE VIEW public.vw_fluxo_futuro_investimento AS
SELECT
  cpr.id::text                       AS evento_id,
  'cpr'                              AS origem,
  cpr.descricao                      AS evento_descricao,
  cpr.valor                          AS valor,
  cpr.data_vencimento                AS data_evento,
  cpr.status                         AS status_cpr,
  cpr.linha_investimento_id          AS linha_id,
  l.descricao                        AS linha_descricao,
  t.id                               AS tema_id,
  t.nome                             AS tema_nome,
  f.id                               AS frente_id,
  f.codigo                           AS frente_codigo,
  f.nome                             AS frente_nome,
  f.ordem                            AS frente_ordem
FROM public.contas_pagar_receber cpr
JOIN public.linhas_investimento l ON l.id = cpr.linha_investimento_id
JOIN public.temas_investimento t  ON t.id = l.tema_id
JOIN public.frentes_investimento f ON f.id = t.frente_id
WHERE cpr.linha_investimento_id IS NOT NULL
  AND cpr.tipo = 'pagar'
  AND cpr.status NOT IN ('pago', 'conciliado', 'cancelado')

UNION ALL

SELECT
  l.id::text                                              AS evento_id,
  'linha_com_data'                                        AS origem,
  l.descricao                                             AS evento_descricao,
  COALESCE(l.valor_fechado, l.valor_inicial)              AS valor,
  l.data_prevista_pagamento                               AS data_evento,
  NULL                                                    AS status_cpr,
  l.id                                                    AS linha_id,
  l.descricao                                             AS linha_descricao,
  t.id                                                    AS tema_id,
  t.nome                                                  AS tema_nome,
  f.id                                                    AS frente_id,
  f.codigo                                                AS frente_codigo,
  f.nome                                                  AS frente_nome,
  f.ordem                                                 AS frente_ordem
FROM public.linhas_investimento l
JOIN public.temas_investimento t  ON t.id = l.tema_id
JOIN public.frentes_investimento f ON f.id = t.frente_id
WHERE l.ativa = true
  AND l.data_prevista_pagamento IS NOT NULL
  AND COALESCE(l.valor_fechado, l.valor_inicial) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.contas_pagar_receber cpr
    WHERE cpr.linha_investimento_id = l.id
      AND cpr.tipo = 'pagar'
      AND cpr.status NOT IN ('cancelado')
  )

UNION ALL

SELECT
  l.id::text                                              AS evento_id,
  'linha_sem_data'                                        AS origem,
  l.descricao                                             AS evento_descricao,
  COALESCE(l.valor_fechado, l.valor_inicial)              AS valor,
  NULL::date                                              AS data_evento,
  NULL                                                    AS status_cpr,
  l.id                                                    AS linha_id,
  l.descricao                                             AS linha_descricao,
  t.id                                                    AS tema_id,
  t.nome                                                  AS tema_nome,
  f.id                                                    AS frente_id,
  f.codigo                                                AS frente_codigo,
  f.nome                                                  AS frente_nome,
  f.ordem                                                 AS frente_ordem
FROM public.linhas_investimento l
JOIN public.temas_investimento t  ON t.id = l.tema_id
JOIN public.frentes_investimento f ON f.id = t.frente_id
WHERE l.ativa = true
  AND l.data_prevista_pagamento IS NULL
  AND COALESCE(l.valor_fechado, l.valor_inicial) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.contas_pagar_receber cpr
    WHERE cpr.linha_investimento_id = l.id
      AND cpr.tipo = 'pagar'
      AND cpr.status NOT IN ('cancelado')
  );

COMMENT ON VIEW public.vw_fluxo_futuro_investimento IS
  'Eventos futuros de saída de caixa por linha de investimento. Origem: cpr (lançado e não pago), linha_com_data (planejado com data), linha_sem_data (planejado sem data).';