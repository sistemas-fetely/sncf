CREATE OR REPLACE FUNCTION public.fn_devolucao_divergencia_loja(p_devolucao_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE v_d record; v_itens jsonb; v_reemb numeric;
BEGIN
  SELECT id, numero, shopify_pedido_id, valor_credito INTO v_d FROM public.devolucao WHERE id = p_devolucao_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devolução não encontrada: %', p_devolucao_id; END IF;
  IF v_d.shopify_pedido_id IS NULL THEN RETURN jsonb_build_object('aplica', false); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shopify_reembolsos r WHERE r.order_id = v_d.shopify_pedido_id) THEN
    RETURN jsonb_build_object('aplica', true, 'sem_reembolso', true, 'diverge', false,
      'reembolsado_itens', 0, 'declarado_valor', coalesce(v_d.valor_credito,0), 'itens_divergentes', '[]'::jsonb);
  END IF;
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
  RETURN jsonb_build_object('aplica', true, 'sem_reembolso', false, 'diverge', jsonb_array_length(v_itens) > 0,
    'reembolsado_itens', v_reemb, 'declarado_valor', coalesce(v_d.valor_credito,0), 'itens_divergentes', v_itens);
END $function$;

REVOKE ALL ON FUNCTION public.fn_devolucao_divergencia_loja(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_devolucao_divergencia_loja(uuid) TO authenticated;