ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS urgencia_declarada text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS urgencia_observacao text;

ALTER TABLE public.pedidos
  DROP CONSTRAINT IF EXISTS pedidos_urgencia_declarada_check;

ALTER TABLE public.pedidos
  ADD CONSTRAINT pedidos_urgencia_declarada_check
  CHECK (urgencia_declarada IN ('normal', 'alta', 'critica'));

COMMENT ON COLUMN public.pedidos.urgencia_declarada IS
  'Sinal manual SOps pra priorização IA. normal (default) | alta | critica.';
COMMENT ON COLUMN public.pedidos.urgencia_observacao IS
  'Justificativa opcional da urgência (texto livre).';

CREATE OR REPLACE VIEW public.v_pedidos_priorizados AS
WITH componentes AS (
  SELECT
    p.id,
    p.id_externo,
    p.parceiro_id,
    p.estagio,
    p.area_atual,
    p.forma_solicitada,
    p.valor_liquido,
    p.urgencia_declarada,
    p.urgencia_observacao,
    p.recebido_em,
    p.estagio_atualizado_em,
    pc.razao_social AS parceiro_razao_social,
    pc.cnpj AS parceiro_cnpj,
    pc.nivel_programa,
    pc.categoria_ka,
    pc.cadastro_incompleto AS parceiro_cadastro_incompleto,
    LEAST(
      15,
      GREATEST(0, EXTRACT(DAY FROM (now() - p.recebido_em))::int)
    )::int AS s_idade,
    CASE
      WHEN p.estagio = 'recebido'
       AND lower(COALESCE(p.forma_solicitada, '')) LIKE '%boleto%'
       AND COALESCE(pc.cadastro_incompleto, true) = false
      THEN 20
      ELSE 0
    END AS s_destrava,
    CASE WHEN EXISTS (
      SELECT 1 FROM public.titulo_a_receber t
      WHERE t.pedido_id = p.id
        AND t.status <> 'pago'
        AND t.data_vencimento_atual <= (CURRENT_DATE + 3)
    ) THEN 20 ELSE 0 END AS s_expira,
    CASE
      WHEN p.valor_liquido > 50000 THEN 20
      WHEN p.valor_liquido > 20000 THEN 15
      WHEN p.valor_liquido > 10000 THEN 10
      WHEN p.valor_liquido > 5000  THEN 5
      ELSE 0
    END AS s_valor,
    CASE
      WHEN pc.nivel_programa IN ('mestre', 'embaixador')
        OR pc.categoria_ka = 'ka'
      THEN 10
      ELSE 0
    END AS s_ka_mestre,
    CASE p.urgencia_declarada
      WHEN 'critica' THEN 15
      WHEN 'alta'    THEN 10
      ELSE 0
    END AS s_urgencia
  FROM public.pedidos p
  LEFT JOIN public.parceiros_comerciais pc ON pc.id = p.parceiro_id
  WHERE p.estagio NOT IN ('faturado', 'entregue', 'cancelado')
)
SELECT
  c.*,
  (c.s_idade + c.s_destrava + c.s_expira + c.s_valor + c.s_ka_mestre + c.s_urgencia)::int
    AS score_total,
  jsonb_build_object(
    'idade',     c.s_idade,
    'destrava',  c.s_destrava,
    'expira',    c.s_expira,
    'valor',     c.s_valor,
    'ka_mestre', c.s_ka_mestre,
    'urgencia',  c.s_urgencia
  ) AS score_breakdown
FROM componentes c;

COMMENT ON VIEW public.v_pedidos_priorizados IS
  'Score de priorização 0-100 por pedido + breakdown. Recalculado a cada SELECT.';

GRANT SELECT ON public.v_pedidos_priorizados TO authenticated, service_role;