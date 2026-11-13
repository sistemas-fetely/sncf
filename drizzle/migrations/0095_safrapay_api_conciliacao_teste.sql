CREATE TABLE public.safrapay_api_conciliacao_teste (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  executado_em timestamptz DEFAULT now(),
  tentativa text,
  url text,
  http_status int,
  qtde_itens int,
  corpo jsonb,
  erro text
);
GRANT ALL ON public.safrapay_api_conciliacao_teste TO service_role;
REVOKE ALL ON public.safrapay_api_conciliacao_teste FROM anon, authenticated;
ALTER TABLE public.safrapay_api_conciliacao_teste ENABLE ROW LEVEL SECURITY;