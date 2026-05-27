-- LOTE 1.1 — grupos_economicos
CREATE TABLE public.grupos_economicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  parceiro_matriz_id uuid,
  origem_deteccao text NOT NULL DEFAULT 'manual'
    CHECK (origem_deteccao IN ('automatica', 'manual')),
  status text NOT NULL DEFAULT 'ativo'
    CHECK (status IN ('ativo', 'fundido', 'encerrado')),
  fundido_em_grupo_id uuid REFERENCES public.grupos_economicos(id),
  observacoes text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid REFERENCES auth.users(id),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_grupos_economicos_matriz ON public.grupos_economicos(parceiro_matriz_id);
CREATE INDEX idx_grupos_economicos_status ON public.grupos_economicos(status) WHERE status = 'ativo';
COMMENT ON TABLE public.grupos_economicos IS 'Vinculação de parceiros (CNPJs) que compartilham sócios ou foram agrupados manualmente.';

-- LOTE 1.2 — programa_niveis_beneficios
CREATE TABLE public.programa_niveis_beneficios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL
    CHECK (slug IN ('convive', 'anfitriao', 'embaixador', 'mestre', 'ka_parceiro', 'ka_familia')),
  nome text NOT NULL,
  ordem_hierarquia int,
  desconto_pct numeric(5,2) NOT NULL DEFAULT 0,
  prazo_padrao_dias int NOT NULL,
  a_vista_boleto_pct numeric(5,2),
  pix_antecipado_pct numeric(5,2),
  cartao_sem_juros_max_parcelas int NOT NULL DEFAULT 2,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES auth.users(id)
);
COMMENT ON TABLE public.programa_niveis_beneficios IS 'Tabela de benefícios por nível do Programa de Parceiros.';

-- LOTE 1.3 — Extensões em parceiros_comerciais
ALTER TABLE public.parceiros_comerciais
  ADD COLUMN bandeira_vermelha boolean NOT NULL DEFAULT false,
  ADD COLUMN bandeira_vermelha_motivo text,
  ADD COLUMN bandeira_vermelha_por uuid REFERENCES auth.users(id),
  ADD COLUMN bandeira_vermelha_em timestamptz,
  ADD COLUMN grupo_economico_id uuid REFERENCES public.grupos_economicos(id) ON DELETE SET NULL,
  ADD COLUMN nivel_programa text NOT NULL DEFAULT 'convive'
    CHECK (nivel_programa IN ('convive', 'anfitriao', 'embaixador', 'mestre')),
  ADD COLUMN categoria_ka text
    CHECK (categoria_ka IS NULL OR categoria_ka IN ('parceiro', 'familia')),
  ADD COLUMN perfil_credito text NOT NULL DEFAULT 'novo_entrada'
    CHECK (perfil_credito IN ('novo_entrada', 'novo_qualificado', 'recorrente_bom_pagador', 'premium', 'bandeira_vermelha')),
  ADD COLUMN contexto_bureau jsonb;

CREATE INDEX idx_parceiros_grupo_economico ON public.parceiros_comerciais(grupo_economico_id);
CREATE INDEX idx_parceiros_perfil_credito ON public.parceiros_comerciais(perfil_credito);
CREATE INDEX idx_parceiros_bandeira_vermelha ON public.parceiros_comerciais(bandeira_vermelha) WHERE bandeira_vermelha = true;

ALTER TABLE public.grupos_economicos
  ADD CONSTRAINT fk_grupos_economicos_matriz
    FOREIGN KEY (parceiro_matriz_id) REFERENCES public.parceiros_comerciais(id) ON DELETE SET NULL;

-- LOTE 1.4 — socios_parceiro
CREATE TABLE public.socios_parceiro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parceiro_id uuid NOT NULL REFERENCES public.parceiros_comerciais(id) ON DELETE CASCADE,
  cpf_cnpj text NOT NULL,
  nome text NOT NULL,
  participacao_pct numeric(5,2),
  qualificacao text,
  data_entrada date,
  nacionalidade text,
  desligado_em timestamptz,
  fonte text NOT NULL DEFAULT 'brasil_api'
    CHECK (fonte IN ('brasil_api', 'serasa', 'bvg', 'manual')),
  ultima_atualizacao timestamptz NOT NULL DEFAULT now(),
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(parceiro_id, cpf_cnpj)
);
CREATE INDEX idx_socios_parceiro_ativo ON public.socios_parceiro(parceiro_id) WHERE desligado_em IS NULL;
CREATE INDEX idx_socios_parceiro_cpf_cnpj ON public.socios_parceiro(cpf_cnpj);

-- LOTE 2.1 — pedidos (módulo crédito; índices renomeados pra evitar colisão com pedidos_venda)
CREATE TABLE public.pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_externo text NOT NULL UNIQUE,
  parceiro_id uuid NOT NULL REFERENCES public.parceiros_comerciais(id),
  data_pedido date NOT NULL,
  valor_bruto numeric(12,2) NOT NULL,
  valor_liquido numeric(12,2) NOT NULL,
  desconto_pct numeric(5,2),
  condicao_solicitada text NOT NULL,
  forma_solicitada text NOT NULL,
  vendedor text,
  origem text CHECK (origem IS NULL OR origem IN ('feira', 'ecommerce', 'vendedor', 'outro')),
  itens_json jsonb,
  recebido_via text NOT NULL DEFAULT 'api'
    CHECK (recebido_via IN ('api', 'csv')),
  recebido_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pedidos_credito_parceiro ON public.pedidos(parceiro_id);
CREATE INDEX idx_pedidos_credito_data ON public.pedidos(data_pedido DESC);
COMMENT ON TABLE public.pedidos IS 'Espelho de pedidos vindos do Sistema de Pedidos do Thomer (apartado do SNCF).';

-- LOTE 2.2 — analises_credito
CREATE TABLE public.analises_credito (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id),
  parceiro_id uuid NOT NULL REFERENCES public.parceiros_comerciais(id),
  analise_anterior_id uuid REFERENCES public.analises_credito(id),
  estagio_atual text NOT NULL DEFAULT 'entrada'
    CHECK (estagio_atual IN ('entrada', 'analise', 'decisao')),
  status_final text 
    CHECK (status_final IS NULL OR status_final IN 
      ('aprovado', 'aprovado_com_ressalva', 'reprovado', 'cancelado')),
  perfil_aplicado text 
    CHECK (perfil_aplicado IS NULL OR perfil_aplicado IN 
      ('novo_entrada', 'novo_qualificado', 'recorrente_bom_pagador', 'premium', 'bandeira_vermelha')),
  limite_concedido numeric(12,2),
  prazo_max_dias int,
  formas_aceitas text[],
  parecer_final text,
  ressalva text,
  validade_ate date,
  analise_ia_json jsonb,
  analise_ia_resumo text,
  analise_ia_confianca numeric(5,2),
  analise_ia_processada_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  encaminhado_analise_em timestamptz,
  encaminhado_decisao_em timestamptz,
  decidido_em timestamptz,
  decidido_por uuid REFERENCES auth.users(id)
);
CREATE INDEX idx_analises_estagio ON public.analises_credito(estagio_atual) WHERE status_final IS NULL;
CREATE INDEX idx_analises_parceiro ON public.analises_credito(parceiro_id);
CREATE INDEX idx_analises_anterior ON public.analises_credito(analise_anterior_id);
CREATE INDEX idx_analises_validade ON public.analises_credito(validade_ate) 
  WHERE status_final IN ('aprovado', 'aprovado_com_ressalva');

-- LOTE 2.3 — analise_credito_transicoes
CREATE TABLE public.analise_credito_transicoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analise_id uuid NOT NULL REFERENCES public.analises_credito(id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES auth.users(id),
  acao text NOT NULL 
    CHECK (acao IN ('digitado', 'encaminhado', 'aprovado', 'aprovado_com_ressalva', 'reprovado', 'devolvido', 'cancelado')),
  estagio_origem text 
    CHECK (estagio_origem IS NULL OR estagio_origem IN ('entrada', 'analise', 'decisao')),
  estagio_destino text 
    CHECK (estagio_destino IS NULL OR estagio_destino IN ('entrada', 'analise', 'decisao')),
  motivo text,
  delta_ia jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_transicoes_analise ON public.analise_credito_transicoes(analise_id, criado_em DESC);
CREATE INDEX idx_transicoes_usuario ON public.analise_credito_transicoes(usuario_id);

-- LOTE 2.4 — analise_credito_scores
CREATE TABLE public.analise_credito_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analise_id uuid NOT NULL REFERENCES public.analises_credito(id) ON DELETE CASCADE,
  parceiro_id uuid NOT NULL REFERENCES public.parceiros_comerciais(id),
  fonte text NOT NULL CHECK (fonte IN ('serasa', 'bvg', 'manual')),
  data_consulta date NOT NULL,
  score_numerico int,
  score_categorico text,
  flag_pefin boolean,
  flag_refin boolean,
  flag_protestos boolean,
  flag_falencia_rj boolean,
  flag_acoes_judiciais boolean,
  flag_cheque_devolvido boolean,
  flag_divida_vencida boolean,
  total_dividas numeric(12,2),
  documento_storage_path text,
  dados_extraidos_json jsonb,
  anexado_por uuid REFERENCES auth.users(id),
  anexado_em timestamptz NOT NULL DEFAULT now(),
  extraido_em timestamptz
);
CREATE INDEX idx_scores_analise ON public.analise_credito_scores(analise_id);
CREATE INDEX idx_scores_parceiro_data ON public.analise_credito_scores(parceiro_id, data_consulta DESC);

-- LOTE 2.5 — parceiro_marcos
CREATE TABLE public.parceiro_marcos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parceiro_id uuid NOT NULL REFERENCES public.parceiros_comerciais(id) ON DELETE CASCADE,
  tipo_marco text NOT NULL CHECK (tipo_marco IN (
    'bandeira_vermelha_subiu','bandeira_vermelha_baixou','nivel_programa_mudou',
    'categoria_ka_mudou','perfil_credito_mudou','grupo_economico_vinculado',
    'grupo_economico_desvinculado','cadastro_completado','analise_aprovada',
    'analise_aprovada_com_ressalva','analise_reprovada','analise_cancelada'
  )),
  valor_anterior text,
  valor_novo text,
  motivo text,
  referencia_id uuid,
  referencia_tipo text,
  operador_id uuid REFERENCES auth.users(id),
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_marcos_parceiro_data ON public.parceiro_marcos(parceiro_id, criado_em DESC);
CREATE INDEX idx_marcos_tipo ON public.parceiro_marcos(tipo_marco);

-- LOTE 2.6 — parceiro_eventos_externos
CREATE TABLE public.parceiro_eventos_externos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parceiro_id uuid NOT NULL REFERENCES public.parceiros_comerciais(id) ON DELETE CASCADE,
  fonte text NOT NULL CHECK (fonte IN ('bvg', 'serasa', 'outro')),
  tipo_evento text NOT NULL,
  data_evento date NOT NULL,
  payload jsonb,
  processado boolean NOT NULL DEFAULT false,
  recebido_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_eventos_parceiro ON public.parceiro_eventos_externos(parceiro_id, data_evento DESC);
CREATE INDEX idx_eventos_nao_processados ON public.parceiro_eventos_externos(parceiro_id) WHERE processado = false;

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grupos_economicos TO authenticated;
GRANT ALL ON public.grupos_economicos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.programa_niveis_beneficios TO authenticated;
GRANT ALL ON public.programa_niveis_beneficios TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.socios_parceiro TO authenticated;
GRANT ALL ON public.socios_parceiro TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedidos TO authenticated;
GRANT ALL ON public.pedidos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analises_credito TO authenticated;
GRANT ALL ON public.analises_credito TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analise_credito_transicoes TO authenticated;
GRANT ALL ON public.analise_credito_transicoes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analise_credito_scores TO authenticated;
GRANT ALL ON public.analise_credito_scores TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parceiro_marcos TO authenticated;
GRANT ALL ON public.parceiro_marcos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parceiro_eventos_externos TO authenticated;
GRANT ALL ON public.parceiro_eventos_externos TO service_role;

-- SEED
INSERT INTO public.programa_niveis_beneficios 
  (slug, nome, ordem_hierarquia, desconto_pct, prazo_padrao_dias, 
   a_vista_boleto_pct, pix_antecipado_pct, cartao_sem_juros_max_parcelas) 
VALUES
  ('convive',     'Convive',              1,    0,  28, 2, NULL, 2),
  ('anfitriao',   'Anfitrião',            2,    5,  35, 2, 3,    3),
  ('embaixador',  'Embaixador',           3,    10, 42, 3, 4,    4),
  ('mestre',      'Mestre de Cerimônia',  4,    15, 42, 3, 5,    5),
  ('ka_parceiro', 'KA Parceiro',          NULL, 20, 37, 4, 6,    5),
  ('ka_familia',  'KA Família',           NULL, 23, 52, 5, 8,    6);

-- RLS
ALTER TABLE public.grupos_economicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programa_niveis_beneficios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.socios_parceiro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analises_credito ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analise_credito_transicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analise_credito_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parceiro_marcos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parceiro_eventos_externos ENABLE ROW LEVEL SECURITY;

CREATE POLICY tmp_auth_all ON public.grupos_economicos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY tmp_auth_all ON public.programa_niveis_beneficios FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY tmp_auth_all ON public.socios_parceiro FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY tmp_auth_all ON public.pedidos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY tmp_auth_all ON public.analises_credito FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY tmp_auth_all ON public.analise_credito_transicoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY tmp_auth_all ON public.analise_credito_scores FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY tmp_auth_all ON public.parceiro_marcos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY tmp_auth_all ON public.parceiro_eventos_externos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- VALIDATE-1
SELECT
  'modulo_analise_credito_v1_schema' AS migration,
  (SELECT count(*)::int FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN (
      'grupos_economicos', 'programa_niveis_beneficios', 'socios_parceiro',
      'pedidos', 'analises_credito', 'analise_credito_transicoes',
      'analise_credito_scores', 'parceiro_marcos', 'parceiro_eventos_externos'
    )) AS tabelas_criadas,
  9 AS tabelas_esperadas,
  (SELECT count(*)::int FROM public.programa_niveis_beneficios) AS niveis_seed,
  6 AS niveis_esperados,
  (SELECT count(*)::int FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = 'parceiros_comerciais'
    AND column_name IN (
      'bandeira_vermelha', 'bandeira_vermelha_motivo', 'bandeira_vermelha_por',
      'bandeira_vermelha_em', 'grupo_economico_id', 'nivel_programa',
      'categoria_ka', 'perfil_credito', 'contexto_bureau'
    )) AS colunas_adicionadas_parceiros,
  9 AS colunas_esperadas;