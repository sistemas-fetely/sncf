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
      WHERE r.order_id = v_d.shopify_pedido_id GROUP BY 1)
    SELECT btrim(i.sku), max(i.product_name), sum(i.quantity)::numeric,
           round(sum(coalesce(rli.sub/nullif(rli.q,0), i.unit_price) * i.quantity) / nullif(sum(i.quantity),0), 4)
    FROM public.shopify_itens i LEFT JOIN rli ON rli.lid = i.line_item_id
    WHERE i.pedido_id = v_d.shopify_pedido_id AND btrim(coalesce(i.sku,'')) <> '' AND i.quantity > 0
    GROUP BY btrim(i.sku);
  ELSIF v_d.pedido_id IS NOT NULL THEN
    RETURN QUERY
    SELECT btrim(pi.sku), max(pi.descricao), sum(pi.quantidade)::numeric,
           round(sum(coalesce(pi.subtotal, pi.valor_unitario*pi.quantidade)) / nullif(sum(pi.quantidade),0), 4)
    FROM public.pedido_itens pi
    WHERE pi.pedido_id = v_d.pedido_id AND btrim(coalesce(pi.sku,'')) <> '' AND pi.quantidade > 0
    GROUP BY btrim(pi.sku);
  END IF;
END $f$;

CREATE OR REPLACE FUNCTION public.devolucao_editar_declaracao(
  p_devolucao_id uuid, p_motivo text, p_itens jsonb DEFAULT NULL, p_pedido_inteiro boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_catalog'
AS $f$
DECLARE v_d record; v_antes jsonb; v_depois jsonb; v_valor numeric; v_tipo text; v_n int; v_falta record; v_tem_origem boolean;
BEGIN
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo da alteração obrigatório (mínimo 5 caracteres).';
  END IF;
  IF NOT coalesce(p_pedido_inteiro,false) AND (p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0) THEN
    RAISE EXCEPTION 'Informe os itens da nova declaração ou use "pedido inteiro".';
  END IF;

  SELECT d.*, c.exige_lastro_financeiro INTO v_d
  FROM public.devolucao d JOIN public.devolucao_canal c ON c.codigo = d.canal
  WHERE d.id = p_devolucao_id FOR UPDATE OF d;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devolução não encontrada: %', p_devolucao_id; END IF;
  IF v_d.status IN ('cancelada','encerrada') THEN
    RAISE EXCEPTION 'Devolução % está %. Declaração não pode mais ser alterada.', v_d.numero, v_d.status;
  END IF;
  IF v_d.nf_dev_status IS NOT NULL THEN
    RAISE EXCEPTION 'Devolução % já tem NF de devolução (%). Alterar a declaração agora desalinharia o fiscal — descarte a NF antes.', v_d.numero, v_d.nf_dev_status;
  END IF;
  IF v_d.exige_lastro_financeiro THEN
    RAISE EXCEPTION 'Devolução % é do canal % e mexeu em título/conta. Edição não suportada aqui — use estornar_devolucao_pedido e redeclare.', v_d.numero, v_d.canal;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('sku',sku,'qtd',qtd_declarada,'valor_unitario',valor_unitario) ORDER BY sku),'[]')
    INTO v_antes FROM public.devolucao_item WHERE devolucao_id = p_devolucao_id;
  v_antes := jsonb_build_object('tipo', v_d.tipo, 'valor_credito', v_d.valor_credito, 'itens', v_antes);

  CREATE TEMP TABLE _nova (sku text, descricao text, qtd numeric, vu numeric) ON COMMIT DROP;
  IF coalesce(p_pedido_inteiro,false) THEN
    INSERT INTO _nova SELECT o.sku, o.descricao, o.quantidade, o.valor_unitario FROM public.fn_devolucao_itens_origem(p_devolucao_id) o;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN RAISE EXCEPTION 'Pedido de origem da devolução % sem itens com SKU no espelho. Declare os itens à mão.', v_d.numero; END IF;
  ELSE
    INSERT INTO _nova
    SELECT btrim(x->>'sku'), max(x->>'descricao'), sum((x->>'quantidade')::numeric),
           max(coalesce((x->>'valor_unitario')::numeric,
               (SELECT o.valor_unitario FROM public.fn_devolucao_itens_origem(p_devolucao_id) o WHERE o.sku = btrim(x->>'sku'))))
    FROM jsonb_array_elements(p_itens) x
    WHERE btrim(coalesce(x->>'sku','')) <> '' AND coalesce((x->>'quantidade')::numeric,0) > 0
    GROUP BY btrim(x->>'sku');
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN RAISE EXCEPTION 'Nenhum item válido (SKU + quantidade > 0) na nova declaração.'; END IF;
  END IF;

  SELECT m.sku, sum(m.quantidade) ret, coalesce(n.qtd,0) nova INTO v_falta
  FROM public.movimentacao_estoque m LEFT JOIN _nova n ON n.sku = m.sku
  WHERE m.devolucao_id = p_devolucao_id
  GROUP BY m.sku, n.qtd HAVING sum(m.quantidade) > coalesce(n.qtd,0) LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'SKU % já teve % un. de retorno físico; a nova declaração traz %. Estorne o recebimento antes de reduzir.', v_falta.sku, v_falta.ret, v_falta.nova;
  END IF;

  DELETE FROM public.devolucao_item WHERE devolucao_id = p_devolucao_id;
  INSERT INTO public.devolucao_item (devolucao_id, sku, descricao, qtd_declarada, valor_unitario)
  SELECT p_devolucao_id, sku, descricao, qtd, vu FROM _nova;

  SELECT round(sum(qtd_declarada * coalesce(valor_unitario,0)),2) INTO v_valor FROM public.devolucao_item WHERE devolucao_id = p_devolucao_id;
  SELECT EXISTS (SELECT 1 FROM public.fn_devolucao_itens_origem(p_devolucao_id)) INTO v_tem_origem;
  v_tipo := CASE WHEN v_tem_origem AND NOT EXISTS (
                    SELECT 1 FROM public.fn_devolucao_itens_origem(p_devolucao_id) o
                    LEFT JOIN public.devolucao_item i ON i.devolucao_id = p_devolucao_id AND i.sku = o.sku
                    WHERE coalesce(i.qtd_declarada,0) < o.quantidade)
                 THEN 'total' ELSE 'parcial' END;
  UPDATE public.devolucao SET tipo = v_tipo, valor_credito = v_valor WHERE id = p_devolucao_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object('sku',sku,'qtd',qtd_declarada,'valor_unitario',valor_unitario) ORDER BY sku),'[]')
    INTO v_depois FROM public.devolucao_item WHERE devolucao_id = p_devolucao_id;
  v_depois := jsonb_build_object('tipo', v_tipo, 'valor_credito', v_valor, 'itens', v_depois);

  INSERT INTO public.audit_log (user_id, acao, tabela, registro_id, dados_antes, dados_depois, justificativa)
  VALUES (auth.uid(), 'devolucao_editar_declaracao', 'devolucao', p_devolucao_id::text, v_antes, v_depois, trim(p_motivo));

  RETURN jsonb_build_object('ok', true, 'devolucao', v_d.numero, 'tipo', v_tipo, 'valor_credito', v_valor,
                            'itens', v_n, 'antes', v_antes, 'depois', v_depois);
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
    SELECT btrim(x->'line_item'->>'sku') sku, sum((x->>'quantity')::numeric) q, sum((x->>'subtotal')::numeric) sub
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
REVOKE ALL ON FUNCTION public.devolucao_editar_declaracao(uuid, text, jsonb, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_devolucao_divergencia_loja(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_devolucao_itens_origem(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.devolucao_editar_declaracao(uuid, text, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_devolucao_divergencia_loja(uuid) TO authenticated;