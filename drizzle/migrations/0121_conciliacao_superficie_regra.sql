SET LOCAL lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.divergencia_superficie_dim (
  slug text PRIMARY KEY,
  nome text NOT NULL,
  descricao text,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.divergencia_superficie_dim TO authenticated;
GRANT ALL ON public.divergencia_superficie_dim TO service_role;
ALTER TABLE public.divergencia_superficie_dim ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS divergencia_superficie_dim_leitura ON public.divergencia_superficie_dim;
CREATE POLICY divergencia_superficie_dim_leitura ON public.divergencia_superficie_dim FOR SELECT TO authenticated USING (true);

INSERT INTO public.divergencia_superficie_dim (slug, nome, descricao, ordem) VALUES
  ('divergencias', 'Divergências', 'Conciliação › Divergências: o que está nos sistemas de fora diferente do SNCF.', 10),
  ('destinos', 'Destinos', 'Central do Produto › Destinos: o SNCF ainda não cadastrou lá fora.', 20),
  ('pendencia_cadastro', 'Pendências de cadastro', 'Conciliação › Ajustes: cadastro incompleto do próprio SNCF.', 30),
  ('estoque', 'Estoque', 'Regras de estoque; fora da Conciliação de Cadastro.', 40)
ON CONFLICT (slug) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, ordem = EXCLUDED.ordem;

ALTER TABLE public.divergencia_regra ADD COLUMN IF NOT EXISTS superficie text NOT NULL DEFAULT 'divergencias';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'divergencia_regra_superficie_fkey') THEN
    ALTER TABLE public.divergencia_regra ADD CONSTRAINT divergencia_regra_superficie_fkey FOREIGN KEY (superficie) REFERENCES public.divergencia_superficie_dim(slug);
  END IF;
END $$;

UPDATE public.divergencia_regra SET superficie = 'estoque' WHERE sistema = 'estoque' AND superficie <> 'estoque';
UPDATE public.divergencia_regra SET superficie = 'pendencia_cadastro' WHERE sistema = 'sncf' AND superficie <> 'pendencia_cadastro';
UPDATE public.divergencia_regra SET superficie = 'destinos'
 WHERE slug IN ('bling_sem_cadastro', 'xpm_sem_cadastro', 'shopify_sem_anuncio', 'shopify_anuncio_rascunho') AND superficie <> 'destinos';

-- Base com todas as regras (definição atual da fila, copiada do banco uma vez).
DO $$
DECLARE d text;
BEGIN
  IF to_regclass('public.vw_conciliacao_fila_todas') IS NULL THEN
    d := pg_get_viewdef('public.vw_conciliacao_fila'::regclass);
    EXECUTE 'CREATE VIEW public.vw_conciliacao_fila_todas WITH (security_invoker = true) AS ' || d;
  END IF;
END $$;
GRANT SELECT ON public.vw_conciliacao_fila_todas TO authenticated;
GRANT ALL ON public.vw_conciliacao_fila_todas TO service_role;

CREATE OR REPLACE VIEW public.vw_conciliacao_fila WITH (security_invoker = true) AS
  SELECT f.* FROM public.vw_conciliacao_fila_todas f
  JOIN public.divergencia_regra r ON r.slug = f.regra
  WHERE r.superficie = 'divergencias';

CREATE OR REPLACE VIEW public.vw_conciliacao_pendencia_cadastro WITH (security_invoker = true) AS
  SELECT f.* FROM public.vw_conciliacao_fila_todas f
  JOIN public.divergencia_regra r ON r.slug = f.regra
  WHERE r.superficie = 'pendencia_cadastro';
GRANT SELECT ON public.vw_conciliacao_pendencia_cadastro TO authenticated;
GRANT ALL ON public.vw_conciliacao_pendencia_cadastro TO service_role;

-- Contagem por produto (Mesa) continua contando todas as pendências.
CREATE OR REPLACE VIEW public.vw_conciliacao_contagem_produto WITH (security_invoker = true) AS
  SELECT cod_cadastro, count(*) AS pendencias, array_agg(DISTINCT sistema ORDER BY sistema) AS sistemas
  FROM public.vw_conciliacao_fila_todas f
  WHERE cod_cadastro IS NOT NULL
  GROUP BY cod_cadastro;

CREATE OR REPLACE FUNCTION public.fn_conciliacao_pendencias_cadastro()
 RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public'
AS $f$
  select coalesce(jsonb_agg(to_jsonb(f) order by f.linha_id), '[]'::jsonb) from vw_conciliacao_pendencia_cadastro f
$f$;
REVOKE ALL ON FUNCTION public.fn_conciliacao_pendencias_cadastro() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conciliacao_pendencias_cadastro() TO authenticated, service_role;