DROP FUNCTION public.atualizar_frete_pedido(uuid, uuid, numeric, text, numeric, numeric, jsonb);
CREATE OR REPLACE FUNCTION public.atualizar_frete_pedido(p_pedido_id uuid, p_transportadora_id uuid DEFAULT NULL::uuid, p_peso_bruto_total numeric DEFAULT NULL::numeric, p_frete_tipo text DEFAULT NULL::text, p_valor_frete numeric DEFAULT NULL::numeric, p_estimativa_valor numeric DEFAULT NULL::numeric, p_estimativa_json jsonb DEFAULT NULL::jsonb, p_limpar_transportadora boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pedido RECORD;
  v_delta_frete NUMERIC;
  v_novo_liquido NUMERIC;
  v_transp_final uuid;
  v_tipo_final   text;
  v_valor_final  numeric;
  v_fetely_paga  boolean;
  v_origem       text;
BEGIN
  SELECT id, id_externo, valor_liquido, valor_frete, frete_tipo,
         transportadora_id, transportadora_origem, alerta_logistica
    INTO v_pedido
  FROM public.pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % não encontrado', p_pedido_id;
  END IF;

  -- FIX 06/10 — valor_frete passa a ser COALESCE (mesmo molde do fix 19/08 do frete_tipo).
  -- Antes: DEFAULT 0 — chamada que so trocava transportadora ZERAVA o frete cobrado
  -- e derrubava o liquido (caso PED-2289). Frete cobrado so muda se vier explicito.
  v_valor_final  := COALESCE(p_valor_frete, v_pedido.valor_frete, 0);
  v_delta_frete  := v_valor_final - COALESCE(v_pedido.valor_frete, 0);
  v_novo_liquido := v_pedido.valor_liquido + v_delta_frete;

  -- FIX 28/07 — GUARDA DUPLA (so com delta <> 0).
  IF ROUND(v_delta_frete, 2) <> 0 THEN
    IF EXISTS (SELECT 1 FROM public.titulo_a_receber t
               WHERE t.pedido_id = p_pedido_id
                 AND t.status NOT IN ('cancelado','cancelado_recuperacao')) THEN
      RAISE EXCEPTION 'Pedido % já tem título a receber ativo — alterar o VALOR do frete (R$ % → R$ %) exige reconciliação do recebível. Demais dados de envio podem ser alterados normalmente.',
        v_pedido.id_externo, COALESCE(v_pedido.valor_frete,0), v_valor_final
        USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.pedido_remessa r
               WHERE r.pedido_id = p_pedido_id AND r.status <> 'cancelada') THEN
      RAISE EXCEPTION 'Pedido % já tem remessa criada — o valor da NF está congelado na remessa; alterar o valor do frete exige recriar a remessa.',
        v_pedido.id_externo
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- FIX 19/08 — frete_tipo COALESCE.
  -- 17/10/2026 — p_limpar_transportadora: unico jeito de tirar a transportadora
  -- ("Nenhuma" / "Definida pelo cliente"). false = comportamento antigo (COALESCE).
  IF COALESCE(p_limpar_transportadora, false) THEN
    v_transp_final := NULL;
  ELSE
    v_transp_final := COALESCE(p_transportadora_id, v_pedido.transportadora_id);
  END IF;
  v_tipo_final   := COALESCE(p_frete_tipo,        v_pedido.frete_tipo);

  SELECT ft.fetely_paga_transportadora INTO v_fetely_paga
    FROM public.frete_tipos ft WHERE ft.codigo = v_tipo_final;

  IF v_transp_final IS NULL THEN
    v_origem := NULL;
  ELSIF v_fetely_paga IS FALSE THEN
    v_origem := 'cliente';
  ELSIF p_transportadora_id IS NOT NULL
        AND p_transportadora_id IS DISTINCT FROM v_pedido.transportadora_id THEN
    v_origem := 'manual';
  ELSE
    v_origem := COALESCE(v_pedido.transportadora_origem, 'manual');
  END IF;

  UPDATE public.pedidos
  SET transportadora_id      = v_transp_final,
      transportadora_origem  = v_origem,
      peso_bruto_total       = COALESCE(p_peso_bruto_total, peso_bruto_total),
      frete_tipo             = v_tipo_final,
      valor_frete            = v_valor_final,
      valor_liquido          = v_novo_liquido,
      estimativa_frete_valor = COALESCE(p_estimativa_valor, estimativa_frete_valor),
      estimativa_frete_json  = COALESCE(p_estimativa_json, estimativa_frete_json),
      estimativa_frete_em    = CASE WHEN p_estimativa_valor IS NOT NULL OR p_estimativa_json IS NOT NULL
                                    THEN now() ELSE estimativa_frete_em END,
      -- FIX 06/10 — transportadora definida aposenta o alerta de sugestao.
      alerta_logistica       = CASE WHEN v_transp_final IS NOT NULL
                                     AND alerta_logistica LIKE 'Sem transportadora sugerida:%'
                                    THEN NULL ELSE alerta_logistica END
  WHERE id = p_pedido_id;

  INSERT INTO public.pedido_eventos (pedido_id, tipo_evento, descricao, automatico, metadata)
  VALUES (
    p_pedido_id, 'alterado',
    format('Dados de envio atualizados — frete %s → %s | líquido %s → %s',
           v_pedido.valor_frete::TEXT, v_valor_final::TEXT,
           v_pedido.valor_liquido::TEXT, v_novo_liquido::TEXT),
    false,
    jsonb_build_object(
      'frete_anterior',   v_pedido.valor_frete,
      'frete_novo',       v_valor_final,
      'liquido_anterior', v_pedido.valor_liquido,
      'liquido_novo',     v_novo_liquido,
      'delta_frete',      ROUND(v_delta_frete,2),
      'estimativa_valor', p_estimativa_valor,
      'frete_tipo_anterior', v_pedido.frete_tipo,
      'frete_tipo',       v_tipo_final,
      'transportadora_origem', v_origem
    ) || CASE WHEN COALESCE(p_limpar_transportadora,false) THEN jsonb_build_object('limpar_transportadora', true) ELSE '{}'::jsonb END
  );

  RETURN json_build_object('ok', true, 'novo_liquido', v_novo_liquido,
                           'valor_frete', v_valor_final,
                           'transportadora_origem', v_origem);
END;
$function$;
REVOKE ALL ON FUNCTION public.atualizar_frete_pedido(uuid, uuid, numeric, text, numeric, numeric, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atualizar_frete_pedido(uuid, uuid, numeric, text, numeric, numeric, jsonb, boolean) TO authenticated, service_role;