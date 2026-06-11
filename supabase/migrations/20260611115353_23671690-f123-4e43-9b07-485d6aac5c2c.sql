
CREATE TABLE public.pedido_tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  concluida boolean NOT NULL DEFAULT false,
  concluida_em timestamptz,
  concluida_por uuid REFERENCES auth.users(id),
  criada_por uuid REFERENCES auth.users(id),
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pedido_tarefas_pedido_idx ON public.pedido_tarefas(pedido_id, ordem);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedido_tarefas TO authenticated;
GRANT ALL ON public.pedido_tarefas TO service_role;
ALTER TABLE public.pedido_tarefas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read pedido_tarefas" ON public.pedido_tarefas FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write pedido_tarefas" ON public.pedido_tarefas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER pedido_tarefas_updated_at BEFORE UPDATE ON public.pedido_tarefas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
