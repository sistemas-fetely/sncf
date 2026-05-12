INSERT INTO public.sncf_sistemas (slug, nome, descricao, icone, cor, rota_base, ordem, ativo)
VALUES (
  'compras',
  'Compras',
  'Pedidos de compra discricionária — gestão de aquisições internas',
  'ShoppingCart',
  '#1A4A3A',
  '/compras',
  90,
  true
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.sncf_user_systems (user_id, sistema_id, ativo)
SELECT '3ee3e444-3ab2-4209-b844-42c0890a095e', id, true
FROM public.sncf_sistemas
WHERE slug = 'compras'
ON CONFLICT DO NOTHING;