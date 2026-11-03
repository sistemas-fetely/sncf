SET LOCAL lock_timeout = '15s';
CREATE TABLE public.shopify_pagamento_sync_execucao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modo text NOT NULL CHECK (modo IN ('diario','backfill')),
  desde timestamptz NOT NULL,
  ate timestamptz NOT NULL,
  cursor text,
  status text NOT NULL DEFAULT 'rodando' CHECK (status IN ('rodando','pausado','concluido','erro')),
  erro text,
  paginas int NOT NULL DEFAULT 0,
  pedidos_lidos int NOT NULL DEFAULT 0,
  refs_novas int NOT NULL DEFAULT 0,
  refs_ja_existiam int NOT NULL DEFAULT 0,
  conflitos jsonb NOT NULL DEFAULT '[]'::jsonb,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz
);
CREATE INDEX shopify_pagamento_sync_execucao_idx ON public.shopify_pagamento_sync_execucao (modo, status, iniciado_em DESC);
GRANT SELECT ON public.shopify_pagamento_sync_execucao TO authenticated;
GRANT ALL ON public.shopify_pagamento_sync_execucao TO service_role;
ALTER TABLE public.shopify_pagamento_sync_execucao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shopify_pag_sync_exec_ler" ON public.shopify_pagamento_sync_execucao FOR SELECT TO authenticated
  USING (public.pode_ler_tabela('shopify_pagamento_sync_execucao', auth.uid()));

CREATE VIEW public.vw_shopify_pagamento_sync_falha WITH (security_invoker = true) AS
WITH ult AS (
  SELECT * FROM public.shopify_pagamento_sync_execucao WHERE modo = 'diario' ORDER BY iniciado_em DESC LIMIT 1
), ok AS (
  SELECT max(concluido_em) AS em FROM public.shopify_pagamento_sync_execucao WHERE modo = 'diario' AND status = 'concluido'
)
SELECT ult.id::text AS id, ult.status, ult.erro, ult.iniciado_em AS desde
  FROM ult WHERE ult.status = 'erro'
UNION ALL
SELECT md5('sem_sucesso_26h'), 'atrasado', 'Sync de pagamentos Shopify sem execução concluída há mais de 26 h', coalesce(ok.em, now())
  FROM ok WHERE ok.em < now() - interval '26 hours'
   AND NOT EXISTS (SELECT 1 FROM ult WHERE ult.status = 'erro');
GRANT SELECT ON public.vw_shopify_pagamento_sync_falha TO authenticated, service_role;

INSERT INTO public.tarefas_filas (chave, nome, descricao, departamento_id, fonte_contagem, fonte_tipo, estado, rota, severidade, ordem, coluna_entrada)
VALUES ('shopify_pagamento_sync_falha_ti', 'Shopify — sync de pagamentos falhou',
  'A sincronização diária dos pagamentos Mercado Pago dos pedidos Shopify falhou ou não concluiu nas últimas 26 h; recebíveis podem ficar sem pedido.',
  '58ca979d-a3fc-4f2d-9f28-0c9c5c4eb120', 'vw_shopify_pagamento_sync_falha', 'view', 'pronta', '/ti/integracoes?aba=mercado_pago', 'alta', 111, 'desde')
ON CONFLICT (chave) DO NOTHING;