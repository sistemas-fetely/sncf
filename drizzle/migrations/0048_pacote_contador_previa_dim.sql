CREATE TABLE IF NOT EXISTS public.remessa_contador_natureza_dim (
  codigo text PRIMARY KEY,
  rotulo text NOT NULL,
  descricao text,
  ordem int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.remessa_contador_natureza_dim TO authenticated;
GRANT ALL ON public.remessa_contador_natureza_dim TO service_role;
ALTER TABLE public.remessa_contador_natureza_dim ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leitura autenticada" ON public.remessa_contador_natureza_dim FOR SELECT TO authenticated USING (true);
INSERT INTO public.remessa_contador_natureza_dim (codigo, rotulo, descricao, ordem) VALUES
 ('previa','Prévia','Gerada com a competência pré-fechada; a posição de estoque inclui presunções declaradas.',1),
 ('definitiva','Definitiva','Gerada com a competência fechada.',2)
ON CONFLICT (codigo) DO NOTHING;
ALTER TABLE public.remessas_contador ADD COLUMN IF NOT EXISTS natureza text REFERENCES public.remessa_contador_natureza_dim(codigo);
UPDATE public.remessas_contador SET natureza = 'definitiva' WHERE natureza IS NULL AND status IS NOT NULL;