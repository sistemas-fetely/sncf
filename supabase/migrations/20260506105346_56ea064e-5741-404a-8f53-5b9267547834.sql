-- PARTE 1: TABELAS
CREATE TABLE IF NOT EXISTS public.frentes_investimento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_frentes_investimento_ativa ON public.frentes_investimento(ativa) WHERE ativa = true;
CREATE INDEX IF NOT EXISTS idx_frentes_investimento_ordem ON public.frentes_investimento(ordem);
COMMENT ON TABLE public.frentes_investimento IS 'Frentes macro de investimento de lançamento. UNIQUE em codigo.';

CREATE TABLE IF NOT EXISTS public.temas_investimento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  frente_id UUID NOT NULL REFERENCES public.frentes_investimento(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(frente_id, codigo)
);
CREATE INDEX IF NOT EXISTS idx_temas_investimento_frente ON public.temas_investimento(frente_id);
CREATE INDEX IF NOT EXISTS idx_temas_investimento_ativa ON public.temas_investimento(ativa) WHERE ativa = true;
COMMENT ON TABLE public.temas_investimento IS 'Sub-temas dentro de uma frente. Ex: Show Room → Reforma, Mobiliário, Arquiteta, Cenografia.';

CREATE TABLE IF NOT EXISTS public.linhas_investimento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tema_id UUID NOT NULL REFERENCES public.temas_investimento(id) ON DELETE RESTRICT,
  descricao TEXT NOT NULL,
  valor_inicial NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_fechado NUMERIC(15,2),
  data_prevista_pagamento DATE,
  responsavel_id UUID REFERENCES auth.users(id),
  observacao TEXT,
  ativa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_linhas_investimento_tema ON public.linhas_investimento(tema_id);
CREATE INDEX IF NOT EXISTS idx_linhas_investimento_ativa ON public.linhas_investimento(ativa) WHERE ativa = true;
CREATE INDEX IF NOT EXISTS idx_linhas_investimento_data_prevista ON public.linhas_investimento(data_prevista_pagamento) WHERE data_prevista_pagamento IS NOT NULL;
COMMENT ON TABLE public.linhas_investimento IS 'Item específico de investimento (folha). valor_inicial = Orçamento Inicial. valor_fechado = Previsto/Fechado (compromisso firmado).';
COMMENT ON COLUMN public.linhas_investimento.valor_fechado IS 'NULL quando cotação ainda não foi fechada. Preenchido quando contrato/pedido firmado.';

-- PARTE 2: ALTERAÇÃO EM contas_pagar_receber
ALTER TABLE public.contas_pagar_receber
  ADD COLUMN IF NOT EXISTS linha_investimento_id UUID REFERENCES public.linhas_investimento(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cpr_linha_investimento ON public.contas_pagar_receber(linha_investimento_id) WHERE linha_investimento_id IS NOT NULL;
COMMENT ON COLUMN public.contas_pagar_receber.linha_investimento_id IS 'Vínculo opcional com uma linha de investimento. Quando preenchido, alimenta o Realizado da linha.';

-- PARTE 3: TRIGGERS
DROP TRIGGER IF EXISTS trg_frentes_investimento_updated_at ON public.frentes_investimento;
CREATE TRIGGER trg_frentes_investimento_updated_at BEFORE UPDATE ON public.frentes_investimento FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_temas_investimento_updated_at ON public.temas_investimento;
CREATE TRIGGER trg_temas_investimento_updated_at BEFORE UPDATE ON public.temas_investimento FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_linhas_investimento_updated_at ON public.linhas_investimento;
CREATE TRIGGER trg_linhas_investimento_updated_at BEFORE UPDATE ON public.linhas_investimento FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- PARTE 4: RLS
ALTER TABLE public.frentes_investimento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.temas_investimento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linhas_investimento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view frentes" ON public.frentes_investimento;
CREATE POLICY "Authenticated can view frentes" ON public.frentes_investimento FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Super admin can insert frentes" ON public.frentes_investimento;
CREATE POLICY "Super admin can insert frentes" ON public.frentes_investimento FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "Super admin can update frentes" ON public.frentes_investimento;
CREATE POLICY "Super admin can update frentes" ON public.frentes_investimento FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "Super admin can delete frentes" ON public.frentes_investimento;
CREATE POLICY "Super admin can delete frentes" ON public.frentes_investimento FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Authenticated can view temas" ON public.temas_investimento;
CREATE POLICY "Authenticated can view temas" ON public.temas_investimento FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Super admin can insert temas" ON public.temas_investimento;
CREATE POLICY "Super admin can insert temas" ON public.temas_investimento FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "Super admin can update temas" ON public.temas_investimento;
CREATE POLICY "Super admin can update temas" ON public.temas_investimento FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "Super admin can delete temas" ON public.temas_investimento;
CREATE POLICY "Super admin can delete temas" ON public.temas_investimento FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Authenticated can view linhas" ON public.linhas_investimento;
CREATE POLICY "Authenticated can view linhas" ON public.linhas_investimento FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Super admin can insert linhas" ON public.linhas_investimento;
CREATE POLICY "Super admin can insert linhas" ON public.linhas_investimento FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "Super admin can update linhas" ON public.linhas_investimento;
CREATE POLICY "Super admin can update linhas" ON public.linhas_investimento FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "Super admin can delete linhas" ON public.linhas_investimento;
CREATE POLICY "Super admin can delete linhas" ON public.linhas_investimento FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- PARTE 5: SEED
INSERT INTO public.frentes_investimento (codigo, nome, descricao, ordem) VALUES
  ('MARKETING_LANCAMENTO', 'Marketing Lançamento', 'Investimento em comunicação, mídia, feiras e produção de marca para o lançamento Fetely.', 10),
  ('PRODUTO', 'Produto', 'Investimento em produção do catálogo, fotos, vídeos, conteúdo e desenvolvimento do mix.', 20),
  ('FABRICA', 'Fábrica', 'Investimento em montagem e estruturação da fábrica em Joinville/SC.', 30),
  ('TI_TELECOM', 'TI e Telecom', 'Investimento em infraestrutura tecnológica, sistemas, equipamentos e telecomunicações.', 40),
  ('SHOWROOM', 'Show Room', 'Investimento na reforma e estruturação do novo show room (reforma, mobiliário, arquiteta, cenografia).', 50)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.temas_investimento (frente_id, codigo, nome, ordem)
SELECT f.id, t.codigo, t.nome, t.ordem
FROM public.frentes_investimento f
CROSS JOIN (VALUES
  ('REFORMA', 'Reforma', 10),
  ('MOBILIARIO', 'Mobiliário', 20),
  ('ARQUITETA', 'Arquiteta', 30),
  ('CENOGRAFIA', 'Cenografia', 40)
) AS t(codigo, nome, ordem)
WHERE f.codigo = 'SHOWROOM'
ON CONFLICT (frente_id, codigo) DO NOTHING;

-- PARTE 6: VIEWS
DROP VIEW IF EXISTS public.vw_linhas_investimento_kpis CASCADE;
CREATE VIEW public.vw_linhas_investimento_kpis AS
SELECT
  l.id AS linha_id, l.tema_id, t.frente_id, l.descricao, l.valor_inicial, l.valor_fechado,
  l.data_prevista_pagamento, l.responsavel_id, l.observacao, l.ativa,
  COALESCE(cpr_agg.total_pago, 0) AS valor_pago,
  COALESCE(cpr_agg.total_lancado, 0) AS valor_lancado,
  CASE WHEN l.valor_fechado IS NOT NULL THEN l.valor_fechado - COALESCE(cpr_agg.total_pago, 0)
       ELSE l.valor_inicial - COALESCE(cpr_agg.total_pago, 0) END AS saldo,
  CASE WHEN l.valor_fechado IS NOT NULL THEN l.valor_inicial - l.valor_fechado ELSE 0 END AS saving,
  COALESCE(cpr_agg.qtd_cpr, 0) AS qtd_cpr,
  COALESCE(cpr_agg.qtd_cpr_pagos, 0) AS qtd_cpr_pagos
FROM public.linhas_investimento l
JOIN public.temas_investimento t ON t.id = l.tema_id
LEFT JOIN (
  SELECT linha_investimento_id,
    SUM(CASE WHEN status IN ('pago', 'conciliado') THEN valor ELSE 0 END) AS total_pago,
    SUM(valor) AS total_lancado,
    COUNT(*) AS qtd_cpr,
    COUNT(*) FILTER (WHERE status IN ('pago', 'conciliado')) AS qtd_cpr_pagos
  FROM public.contas_pagar_receber
  WHERE linha_investimento_id IS NOT NULL AND status <> 'cancelado' AND tipo = 'pagar'
  GROUP BY linha_investimento_id
) cpr_agg ON cpr_agg.linha_investimento_id = l.id
WHERE l.ativa = true;
COMMENT ON VIEW public.vw_linhas_investimento_kpis IS 'KPIs por linha. Saldo=Fechado-Pago (com fechado) ou Inicial-Pago (sem fechado). Saving=Inicial-Fechado quando fechado<inicial. Conciliado=pago.';

DROP VIEW IF EXISTS public.vw_temas_investimento_kpis CASCADE;
CREATE VIEW public.vw_temas_investimento_kpis AS
SELECT t.id AS tema_id, t.frente_id, t.codigo, t.nome, t.ordem, t.ativa,
  COALESCE(SUM(k.valor_inicial), 0) AS total_inicial,
  COALESCE(SUM(k.valor_fechado), 0) AS total_fechado,
  COALESCE(SUM(k.valor_pago), 0) AS total_pago,
  COALESCE(SUM(k.valor_lancado), 0) AS total_lancado,
  COALESCE(SUM(k.saldo), 0) AS total_saldo,
  COALESCE(SUM(k.saving), 0) AS total_saving,
  COUNT(k.linha_id) AS qtd_linhas,
  COALESCE(SUM(k.qtd_cpr), 0) AS qtd_cpr,
  COALESCE(SUM(k.qtd_cpr_pagos), 0) AS qtd_cpr_pagos
FROM public.temas_investimento t
LEFT JOIN public.vw_linhas_investimento_kpis k ON k.tema_id = t.id
WHERE t.ativa = true
GROUP BY t.id, t.frente_id, t.codigo, t.nome, t.ordem, t.ativa;
COMMENT ON VIEW public.vw_temas_investimento_kpis IS 'KPIs agregados por tema, somando linhas via vw_linhas_investimento_kpis.';

DROP VIEW IF EXISTS public.vw_frentes_investimento_kpis CASCADE;
CREATE VIEW public.vw_frentes_investimento_kpis AS
SELECT f.id AS frente_id, f.codigo, f.nome, f.descricao, f.ordem, f.ativa,
  COALESCE(SUM(t.total_inicial), 0) AS total_inicial,
  COALESCE(SUM(t.total_fechado), 0) AS total_fechado,
  COALESCE(SUM(t.total_pago), 0) AS total_pago,
  COALESCE(SUM(t.total_lancado), 0) AS total_lancado,
  COALESCE(SUM(t.total_saldo), 0) AS total_saldo,
  COALESCE(SUM(t.total_saving), 0) AS total_saving,
  COUNT(DISTINCT t.tema_id) FILTER (WHERE t.qtd_linhas > 0) AS qtd_temas_com_linhas,
  COALESCE(SUM(t.qtd_linhas), 0) AS qtd_linhas,
  COALESCE(SUM(t.qtd_cpr_pagos), 0) AS qtd_cpr_pagos
FROM public.frentes_investimento f
LEFT JOIN public.vw_temas_investimento_kpis t ON t.frente_id = f.id
WHERE f.ativa = true
GROUP BY f.id, f.codigo, f.nome, f.descricao, f.ordem, f.ativa;
COMMENT ON VIEW public.vw_frentes_investimento_kpis IS 'KPIs agregados por frente (topo). Usado nos cards do painel do Thomer.';