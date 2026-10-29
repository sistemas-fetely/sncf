CREATE OR REPLACE FUNCTION public.fn_devolucao_itens_origem(p_devolucao_id uuid)
RETURNS TABLE(sku text, descricao text, quantidade numeric, valor_unitario numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_catalog'
AS $f$
DECLARE v_d record;
BEGIN
  SELECT d.shopify_pedido_id, d.pedido_id INTO v_d FROM public.devolucao d WHERE d.id = p_devolucao_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devolução não encontrada: %', p_devolucao_id; END IF;
  IF v_d.shopify_pedido_id IS NOT NULL THEN
    RETURN QUERY
    WITH rli AS (
      SELECT (x->>'line_item_id')::bigint lid, sum((x->>'subtotal')::numeric) sub, sum((x->>'quantity')::numeric) q
      FROM public.shopify_reembolsos r, jsonb_array_elements(r.refund_line_items) x
      WHERE r.order_id = v_d.shopify_pedido_id GROUP BY 1),
    it AS (
      SELECT coalesce((SELECT sd.sku_canonico FROM public.sku_depara sd WHERE sd.sku_origem = btrim(i.sku) AND sd.ativo LIMIT 1), btrim(i.sku)) csku,
             i.product_name, i.quantity, i.unit_price, i.line_item_id
      FROM public.shopify_itens i
      WHERE i.pedido_id = v_d.shopify_pedido_id AND btrim(coalesce(i.sku,'')) <> '' AND i.quantity > 0)
    SELECT it.csku, max(it.product_name), sum(it.quantity)::numeric,
           round(sum(coalesce(rli.sub/nullif(rli.q,0), it.unit_price) * it.quantity) / nullif(sum(it.quantity),0), 4)
    FROM it LEFT JOIN rli ON rli.lid = it.line_item_id
    GROUP BY it.csku;
  ELSIF v_d.pedido_id IS NOT NULL THEN
    RETURN QUERY
    WITH it AS (
      SELECT coalesce((SELECT sd.sku_canonico FROM public.sku_depara sd WHERE sd.sku_origem = btrim(pi.sku) AND sd.ativo LIMIT 1), btrim(pi.sku)) csku,
             pi.descricao, pi.quantidade, pi.subtotal, pi.valor_unitario
      FROM public.pedido_itens pi
      WHERE pi.pedido_id = v_d.pedido_id AND btrim(coalesce(pi.sku,'')) <> '' AND pi.quantidade > 0)
    SELECT it.csku, max(it.descricao), sum(it.quantidade)::numeric,
           round(sum(coalesce(it.subtotal, it.valor_unitario*it.quantidade)) / nullif(sum(it.quantidade),0), 4)
    FROM it GROUP BY it.csku;
  END IF;
END $f$;

CREATE OR REPLACE FUNCTION public.fn_devolucao_divergencia_loja(p_devolucao_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_catalog'
AS $f$
DECLARE v_d record; v_itens jsonb; v_reemb numeric;
BEGIN
  SELECT id, numero, shopify_pedido_id, valor_credito INTO v_d FROM public.devolucao WHERE id = p_devolucao_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devolução não encontrada: %', p_devolucao_id; END IF;
  IF v_d.shopify_pedido_id IS NULL THEN RETURN jsonb_build_object('aplica', false); END IF;
  WITH rli AS (
    SELECT coalesce((SELECT sd.sku_canonico FROM public.sku_depara sd WHERE sd.sku_origem = btrim(x->'line_item'->>'sku') AND sd.ativo LIMIT 1), btrim(x->'line_item'->>'sku')) sku,
           sum((x->>'quantity')::numeric) q, sum((x->>'subtotal')::numeric) sub
    FROM public.shopify_reembolsos r, jsonb_array_elements(r.refund_line_items) x
    WHERE r.order_id = v_d.shopify_pedido_id GROUP BY 1),
  dec AS (SELECT sku, qtd_declarada q FROM public.devolucao_item WHERE devolucao_id = p_devolucao_id),
  j AS (SELECT coalesce(rli.sku, dec.sku) sku, coalesce(rli.q,0) reembolsado, coalesce(dec.q,0) declarado, coalesce(rli.sub,0) sub
        FROM rli FULL JOIN dec ON dec.sku = rli.sku)
  SELECT coalesce(jsonb_agg(jsonb_build_object('sku',sku,'reembolsado',reembolsado,'declarado',declarado) ORDER BY sku)
                  FILTER (WHERE reembolsado <> declarado),'[]'), coalesce(sum(sub),0)
    INTO v_itens, v_reemb FROM j;
  RETURN jsonb_build_object('aplica', true, 'diverge', jsonb_array_length(v_itens) > 0,
    'reembolsado_itens', v_reemb, 'declarado_valor', coalesce(v_d.valor_credito,0), 'itens_divergentes', v_itens);
END $f$;

REVOKE ALL ON FUNCTION public.fn_devolucao_itens_origem(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_devolucao_divergencia_loja(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_devolucao_itens_origem(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_devolucao_divergencia_loja(uuid) TO authenticated;