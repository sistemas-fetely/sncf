ALTER TABLE public.shopify_itens
  ADD COLUMN IF NOT EXISTS line_item_id bigint,
  ADD COLUMN IF NOT EXISTS current_quantity integer;

ALTER TABLE public.shopify_pedidos
  ADD COLUMN IF NOT EXISTS total_original numeric,
  ADD COLUMN IF NOT EXISTS subtotal_original numeric;