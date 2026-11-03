-- MERCADO PAGO FASE 1 (03/11/2026, Flávio): importação automática diária dos relatórios.
-- Uma linha por (tipo, dia BRT). Escrita só pela edge mp-relatorios (service_role).

CREATE TABLE public.mp_relatorio_status_dim (
  codigo text PRIMARY KEY,
  rotulo text NOT NULL,
  estado_selo text NOT NULL,
  ordem int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.mp_relatorio_status_dim TO authenticated;
GRANT ALL ON public.mp_relatorio_status_dim TO service_role;
ALTER TABLE public.mp_relatorio_status_dim ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mp_status_dim_ler" ON public.mp_relatorio_status_dim FOR SELECT TO authenticated USING (true);
INSERT INTO public.mp_relatorio_status_dim (codigo, rotulo, estado_selo, ordem) VALUES
  ('aguardando', 'Aguardando o Mercado Pago', 'info', 1),
  ('importado', 'Importado', 'success', 2),
  ('sem_movimento', 'Sem movimento no dia', 'neutral', 3),
  ('erro', 'Erro', 'danger', 4);

CREATE TABLE public.mp_relatorio_tipo_dim (
  codigo text PRIMARY KEY,
  rotulo text NOT NULL,
  fonte_tipo text NOT NULL,
  ordem int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.mp_relatorio_tipo_dim TO authenticated;
GRANT ALL ON public.mp_relatorio_tipo_dim TO service_role;
ALTER TABLE public.mp_relatorio_tipo_dim ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mp_tipo_dim_ler" ON public.mp_relatorio_tipo_dim FOR SELECT TO authenticated USING (true);
INSERT INTO public.mp_relatorio_tipo_dim (codigo, rotulo, fonte_tipo, ordem) VALUES
  ('release', 'Liberações', 'mp_release', 1),
  ('settlement', 'Vendas (settlement)', 'mp_settlement', 2);

CREATE TABLE public.mp_relatorio_execucao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL REFERENCES public.mp_relatorio_tipo_dim(codigo),
  dia date NOT NULL,
  origem text NOT NULL DEFAULT 'sncf_pedido' CHECK (origem IN ('sncf_pedido','schedule_mp','arquivo_mp_existente')),
  status text NOT NULL DEFAULT 'aguardando' REFERENCES public.mp_relatorio_status_dim(codigo),
  mp_report_id bigint,
  file_name text,
  tentativas int NOT NULL DEFAULT 0,
  erro text,
  extrato_importacao_id uuid REFERENCES public.extrato_importacoes(id),
  arquivo_storage_path text,
  linhas_lidas int, linhas_novas int, linhas_duplicadas int, linhas_enriquecidas int, linhas_ignoradas int,
  solicitado_em timestamptz NOT NULL DEFAULT now(),
  importado_em timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, dia)
);
CREATE INDEX mp_relatorio_execucao_status_idx ON public.mp_relatorio_execucao (status, tipo);
GRANT SELECT ON public.mp_relatorio_execucao TO authenticated;
GRANT ALL ON public.mp_relatorio_execucao TO service_role;
ALTER TABLE public.mp_relatorio_execucao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mp_execucao_ler" ON public.mp_relatorio_execucao FOR SELECT TO authenticated
  USING (public.pode_ler_tabela('mp_relatorio_execucao', auth.uid()));

-- Ação dos botões "Importar dia"/"Buscar retroativo" (aba TI > Integrações > Mercado Pago).
INSERT INTO public.permissoes_catalogo (slug, tipo, pilar, nome_exibicao, descricao, categoria_sod, contem_dado_sensivel, ativo, publica)
VALUES ('acao.mp_relatorio.reprocessar','acao','sistema','Reprocessar relatório do Mercado Pago',
  'Pede, baixa e importa os relatórios do Mercado Pago de um dia (ou retroativo) pelo mesmo caminho da importação manual.','execucao', false, true, false)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.acao_superficie (rota, arquivo, rotulo, dispara, guarda_atual, risco, permissao_id, origem, observacao)
SELECT '/ti/integracoes', 'src/pages/ti/integracoes/RelatoriosMercadoPago.tsx', x.rotulo, 'edge mp-relatorios', 'acao.mp_relatorio.reprocessar', 'MEDIO', pc.id, 'mp-fase1-2026-11-03', x.obs
FROM public.permissoes_catalogo pc,
  (VALUES ('Importar dia (Mercado Pago)', 'Pede/baixa/importa liberações e vendas de um dia.'),
          ('Buscar retroativo (Mercado Pago)', 'Importa os dias faltantes desde a data informada.')) x(rotulo, obs)
WHERE pc.slug = 'acao.mp_relatorio.reprocessar';

-- Dias sem importação: D sem importado/sem_movimento depois das 12:00 BRT de D+1, ou erro.
CREATE OR REPLACE VIEW public.vw_mp_relatorio_atrasado WITH (security_invoker = true) AS
WITH dias AS (
  SELECT d::date AS dia FROM generate_series(date '2026-09-15', ((now() AT TIME ZONE 'America/Sao_Paulo')::date - 1), interval '1 day') d
), esperado AS (
  SELECT t.codigo AS tipo, t.rotulo AS tipo_rotulo, dias.dia FROM dias CROSS JOIN public.mp_relatorio_tipo_dim t
)
SELECT md5(e.tipo || e.dia::text) AS id, e.tipo, e.tipo_rotulo, e.dia, coalesce(x.status, 'nao_pedido') AS status,
       x.erro, x.tentativas, ((e.dia + 1) + time '12:00') AT TIME ZONE 'America/Sao_Paulo' AS desde
  FROM esperado e
  LEFT JOIN public.mp_relatorio_execucao x ON x.tipo = e.tipo AND x.dia = e.dia
 WHERE coalesce(x.status, 'nao_pedido') NOT IN ('importado','sem_movimento')
   AND now() > ((e.dia + 1) + time '12:00') AT TIME ZONE 'America/Sao_Paulo';
GRANT SELECT ON public.vw_mp_relatorio_atrasado TO authenticated, service_role;

INSERT INTO public.tarefas_filas (chave, nome, descricao, departamento_id, fonte_contagem, fonte_tipo, estado, rota, severidade, ordem, coluna_entrada)
VALUES
 ('mp_relatorio_atrasado_fin', 'Mercado Pago — relatório não importado',
  'Dia sem liberações ou vendas do Mercado Pago importadas até 12h do dia seguinte (ou com erro).',
  'c752fdfe-cdcc-47ad-9c97-5cb3777efe36', 'vw_mp_relatorio_atrasado', 'view', 'pronta', '/ti/integracoes?aba=mercado_pago', 'alta', 110, 'desde'),
 ('mp_relatorio_atrasado_ti', 'Mercado Pago — relatório não importado (rotina)',
  'Rotina automática do Mercado Pago não importou um dia até 12h do dia seguinte (ou com erro).',
  '58ca979d-a3fc-4f2d-9f28-0c9c5c4eb120', 'vw_mp_relatorio_atrasado', 'view', 'pronta', '/ti/integracoes?aba=mercado_pago', 'alta', 110, 'desde')
ON CONFLICT (chave) DO NOTHING;