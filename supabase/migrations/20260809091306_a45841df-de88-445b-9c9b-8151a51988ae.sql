CREATE TABLE public.bling_nome_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL,
  bling_id text NOT NULL,
  nome_antes text,
  nome_depois text,
  sucesso boolean NOT NULL,
  resposta_status int,
  erro_msg text,
  dry_run boolean NOT NULL DEFAULT false,
  tentativa_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.bling_nome_log TO authenticated;
GRANT ALL ON public.bling_nome_log TO service_role;

ALTER TABLE public.bling_nome_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados podem ler log de nomes Bling"
ON public.bling_nome_log FOR SELECT TO authenticated USING (true);

CREATE INDEX idx_bling_nome_log_sku ON public.bling_nome_log (sku);
CREATE INDEX idx_bling_nome_log_tentativa_em ON public.bling_nome_log (tentativa_em DESC);