DELETE FROM public.titulo_a_receber;
DELETE FROM public.bling_envios_log;
DELETE FROM public.pedido_eventos;
DELETE FROM public.pedido_itens;
DELETE FROM public.pedido_transicoes;
UPDATE public.nfs_emitidas SET pedido_venda_id = NULL WHERE pedido_venda_id IS NOT NULL;
UPDATE public.nfs_stage_venda SET pedido_id = NULL WHERE pedido_id IS NOT NULL;
DELETE FROM public.analises_credito;
DELETE FROM public.pedidos;