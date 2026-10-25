-- 25/10/2026 CARTAO-MAQUININHA: forma cartao com condicao "maquininha" classifica como cartao_maquininha.
CREATE OR REPLACE FUNCTION public.fn_classificar_pagamento(p_forma_solicitada text, p_condicao_solicitada text, p_valor_liquido numeric)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_forma        text;
  v_cond         jsonb;
  v_qtd_parcelas integer;
  v_tem_entrada  boolean;
BEGIN
  v_forma := lower(trim(coalesce(p_forma_solicitada, '')));
  v_forma := CASE
    WHEN v_forma LIKE '%pix%'                                THEN 'pix'
    WHEN v_forma LIKE '%cartao%' OR v_forma LIKE '%cartão%' THEN 'cartao'
    WHEN v_forma LIKE '%conta_corrente%' OR v_forma LIKE '%conta corrente%' THEN 'conta_corrente'
    WHEN v_forma LIKE '%boleto%'                             THEN 'boleto'
    ELSE NULL
  END;

  IF v_forma IS NULL THEN
    RETURN NULL;
  END IF;

  -- PIX 13/08/2026: a forma sozinha nao decide mais. "PIX no faturamento" e PIX
  -- sem portao — o cliente prefere PIX a boleto e paga contra a NF. Nao e credito:
  -- a mercadoria nao sai antes do dinheiro, o portao so muda de lugar.
  IF v_forma = 'pix' THEN
    IF lower(coalesce(p_condicao_solicitada, '')) LIKE '%faturamento%' THEN
      RETURN 'pix_faturamento';
    END IF;
    RETURN 'pix';
  END IF;

  IF v_forma = 'cartao' THEN
    -- 25/10/2026 CARTAO-MAQUININHA: cartao passado na loja, sem link.
    IF lower(coalesce(p_condicao_solicitada, '')) LIKE '%maquininha%' THEN
      RETURN 'cartao_maquininha';
    END IF;
    RETURN 'cartao';
  END IF;

  IF v_forma = 'conta_corrente' THEN
    RETURN 'conta_corrente';   -- FIX consignado 09/08: parcela única, sem instrumento
  END IF;

  -- boleto: distingue a vista / com entrada / sem entrada pelo parse
  IF COALESCE(p_valor_liquido, 0) <= 0 THEN
    RETURN NULL;
  END IF;

  v_cond := public.fn_parse_condicao(p_condicao_solicitada, p_valor_liquido, NULL);

  IF (v_cond ->> 'parseada_por') = 'fallback_condicao_nao_reconhecida' THEN
    RETURN NULL;
  END IF;

  v_qtd_parcelas := jsonb_array_length(COALESCE(v_cond -> 'parcelas_a_prazo', '[]'::jsonb));
  v_tem_entrada  := COALESCE((v_cond ->> 'tem_entrada')::boolean, false);

  IF v_qtd_parcelas = 0 THEN
    RETURN 'boleto_avista';
  ELSIF v_tem_entrada THEN
    RETURN 'boleto_com_entrada';
  ELSE
    RETURN 'boleto_sem_entrada';
  END IF;
END;
$function$;

ALTER TABLE public.regras_pagamento_pedido DROP CONSTRAINT regras_pagamento_pedido_codigo_check;
ALTER TABLE public.regras_pagamento_pedido ADD CONSTRAINT regras_pagamento_pedido_codigo_check CHECK (codigo = ANY (ARRAY['cartao','pix','pix_faturamento','boleto_avista','boleto_com_entrada','boleto_sem_entrada','conta_corrente','cartao_maquininha']));
INSERT INTO regras_pagamento_pedido (codigo, nome, forma, ordem, ativo, espera_pagamento, parcela_unica, passa_por_analise, pix_a_prazo, portao_minimo_pct)
VALUES ('cartao_maquininha', 'Cartao maquininha (a vista, na loja)', 'cartao', 1, true, true, true, false, false, 100)
ON CONFLICT (codigo) DO NOTHING;
INSERT INTO condicoes_pagamento (slug, rotulo, condicao_canonica, forma, regra_codigo, ordem, ativo, descricao)
VALUES ('cartao_maquininha', 'Cartão maquininha', 'Cartão maquininha à vista', 'cartao', 'cartao_maquininha', 21, true, 'Cartão passado na maquininha da loja (Site SP). Sem link; prova = comprovante com NSU.')
ON CONFLICT (slug) DO NOTHING;

-- 25/10/2026 CARTAO-MAQUININHA: meio atual do pedido VD normalizado (pix / cartao / cartao_maquininha) pelo codigo da regra.
CREATE OR REPLACE FUNCTION public.fn_vd_meio_atual(p_pedido_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT CASE WHEN r.codigo = 'cartao_maquininha' THEN 'cartao_maquininha'
              WHEN p.forma_solicitada IN ('cartao','cartao_credito') THEN 'cartao' ELSE 'pix' END
    FROM pedidos p LEFT JOIN regras_pagamento_pedido r ON r.id = p.regra_pagamento_id WHERE p.id = p_pedido_id
$f$;
REVOKE ALL ON FUNCTION public.fn_vd_meio_atual(uuid) FROM anon;