CREATE TABLE public.safra_api_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id uuid NOT NULL,
  ambiente text NOT NULL,
  endpoint text NOT NULL,
  metodo text NOT NULL,
  titulo_boleto_id uuid NULL,
  request jsonb,
  response jsonb,
  http_status int,
  erro_codigo text,
  erro_msg text,
  created_at timestamptz DEFAULT now()
);
GRANT ALL ON public.safra_api_log TO service_role;
REVOKE ALL ON public.safra_api_log FROM anon, authenticated;
ALTER TABLE public.safra_api_log ENABLE ROW LEVEL SECURITY;