CREATE OR REPLACE FUNCTION public.gerar_parcelas_pasta_contrato(p_contrato_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contrato public.pasta_contratos%ROWTYPE;
  v_horizonte_meses_default int := 12;
  v_qtd_parcelas int;
  v_intervalo_meses int := 1;
  v_valor_parcela_setup numeric;
  v_data_primeira_setup date;
  i int;
BEGIN
  SELECT * INTO v_contrato 
  FROM public.pasta_contratos 
  WHERE id = p_contrato_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato % não encontrado', p_contrato_id;
  END IF;
  
  DELETE FROM public.pasta_contrato_parcelas 
  WHERE contrato_id = p_contrato_id 
    AND status = 'pendente';
  
  v_intervalo_meses := CASE LOWER(COALESCE(v_contrato.ciclo_pagamento, 'mensal'))
    WHEN 'mensal'      THEN 1
    WHEN 'bimestral'   THEN 2
    WHEN 'trimestral'  THEN 3
    WHEN 'semestral'   THEN 6
    WHEN 'anual'       THEN 12
    ELSE 1
  END;
  
  IF v_contrato.tem_setup 
     AND COALESCE(v_contrato.valor_setup, 0) > 0 
     AND COALESCE(v_contrato.parcelas_setup, 0) > 0 THEN
    
    v_valor_parcela_setup := v_contrato.valor_setup / v_contrato.parcelas_setup;
    v_data_primeira_setup := COALESCE(
      v_contrato.data_primeira_parcela_setup, 
      v_contrato.vigencia_inicio,
      v_contrato.data_primeira_parcela
    );
    
    FOR i IN 1..v_contrato.parcelas_setup LOOP
      INSERT INTO public.pasta_contrato_parcelas (
        contrato_id, origem, numero_parcela, total_parcelas, 
        data_vencimento, valor, status
      )
      VALUES (
        p_contrato_id,
        'setup',
        i,
        v_contrato.parcelas_setup,
        v_data_primeira_setup + ((i - 1) * INTERVAL '1 month'),
        v_valor_parcela_setup,
        'pendente'
      );
    END LOOP;
  END IF;
  
  IF COALESCE(v_contrato.valor_parcela, 0) > 0 
     AND v_contrato.data_primeira_parcela IS NOT NULL THEN
    
    IF v_contrato.numero_parcelas IS NOT NULL AND v_contrato.numero_parcelas > 0 THEN
      v_qtd_parcelas := v_contrato.numero_parcelas;
    ELSIF v_contrato.vigencia_fim IS NOT NULL THEN
      v_qtd_parcelas := GREATEST(1, 
        CEIL((
          EXTRACT(YEAR FROM AGE(v_contrato.vigencia_fim, v_contrato.data_primeira_parcela))::int * 12 
          + EXTRACT(MONTH FROM AGE(v_contrato.vigencia_fim, v_contrato.data_primeira_parcela))::int
          + 1
        )::numeric / v_intervalo_meses)::int
      );
    ELSE
      v_qtd_parcelas := v_horizonte_meses_default;
    END IF;
    
    FOR i IN 1..v_qtd_parcelas LOOP
      INSERT INTO public.pasta_contrato_parcelas (
        contrato_id, origem, numero_parcela, total_parcelas,
        data_vencimento, valor, status
      )
      VALUES (
        p_contrato_id,
        'principal',
        i,
        v_qtd_parcelas,
        v_contrato.data_primeira_parcela + ((i - 1) * v_intervalo_meses * INTERVAL '1 month'),
        v_contrato.valor_parcela,
        'pendente'
      );
    END LOOP;
  END IF;
END;
$$;

DO $$
DECLARE
  v_contrato_id uuid;
BEGIN
  FOR v_contrato_id IN 
    SELECT id FROM public.pasta_contratos
  LOOP
    PERFORM public.gerar_parcelas_pasta_contrato(v_contrato_id);
  END LOOP;
END $$;