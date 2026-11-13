ALTER TABLE public.pagamento_link DROP CONSTRAINT IF EXISTS pagamento_link_meio_check;
ALTER TABLE public.pagamento_link ADD CONSTRAINT pagamento_link_meio_check CHECK (meio = ANY (ARRAY['cartao_link'::text, 'pix'::text, 'pix_link'::text]));
COMMENT ON COLUMN public.pagamento_link.meio IS 'cartao_link = link Safrapay cartao; pix_link = link Safrapay PIX (smartcheckout, 13/11/2026); pix = legado cobranca PIX direta (charge, 03/10/2026).';

ALTER TABLE public.regras_pagamento_pedido DROP CONSTRAINT IF EXISTS regras_pagamento_pedido_codigo_check;
ALTER TABLE public.regras_pagamento_pedido ADD CONSTRAINT regras_pagamento_pedido_codigo_check CHECK (codigo = ANY (ARRAY['cartao'::text, 'pix'::text, 'pix_faturamento'::text, 'pix_safra'::text, 'boleto_avista'::text, 'boleto_com_entrada'::text, 'boleto_sem_entrada'::text, 'conta_corrente'::text, 'cartao_maquininha'::text, 'bonificacao'::text]));

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
  v_regra_sem    text;
BEGIN
  -- BONIFICACAO-TEM-CONDICAO (29/10/2026): forma que nao gera duplicata (sem_pagamento) tem regra
  -- declarada na dimensao regras_pagamento_pedido. Antes caia em NULL (forma nao reconhecida).
  SELECT r.codigo INTO v_regra_sem
    FROM public.regras_pagamento_pedido r
    JOIN public.formas_pagamento f ON f.codigo = r.forma
   WHERE r.ativo AND NOT f.gera_duplicata
     AND f.codigo = lower(trim(coalesce(p_forma_solicitada, '')))
   ORDER BY r.ordem LIMIT 1;
  IF v_regra_sem IS NOT NULL THEN
    RETURN v_regra_sem;
  END IF;

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
    -- 13/11/2026 PIX-SAFRA-LINK: PIX cobrado por link Safrapay (ao lado do QR local).
    IF lower(coalesce(p_condicao_solicitada, '')) LIKE '%safra%' THEN
      RETURN 'pix_safra';
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

INSERT INTO public.regras_pagamento_pedido
  (codigo, nome, forma, ordem, ativo, espera_pagamento, parcela_unica, passa_por_analise, pix_a_prazo, portao_minimo_pct)
SELECT 'pix_safra', 'PIX pelo Safra (link)', 'pix', 4, true, true, true, false, false, 100
WHERE NOT EXISTS (SELECT 1 FROM public.regras_pagamento_pedido WHERE codigo = 'pix_safra');
INSERT INTO public.condicoes_pagamento (slug, rotulo, forma, condicao_canonica, regra_codigo, ativo, ordem, descricao)
SELECT 'pix_safra', 'PIX pelo Safra', 'pix', 'PIX pelo Safra', 'pix_safra', true, 11,
       'PIX cobrado por link Safrapay (confirma sozinho). O PIX comum segue como QR na chave da Fetely.'
WHERE NOT EXISTS (SELECT 1 FROM public.condicoes_pagamento WHERE slug = 'pix_safra');