-- All test cards and canonical choices are rolled back.
BEGIN;
DO $test$
DECLARE
  v_codigo text := 'Teste-Canonico-' || gen_random_uuid()::text;
  v_bling text := 'teste-' || gen_random_uuid()::text;
  v_id uuid;
  v_antes jsonb;
BEGIN
  INSERT INTO public.produtos (codigo, bling_id, nome)
  VALUES (v_codigo, v_bling, 'Card de teste transacional') RETURNING id INTO v_id;
  IF NOT EXISTS (
    SELECT 1 FROM public.bling_card_canonico
    WHERE sku = v_codigo AND bling_id = v_bling AND escolhido_por = 'regra'
      AND motivo = 'card novo — gravado no nascimento' AND n_candidatos = 1
      AND atualizado_em = now()
  ) THEN RAISE EXCEPTION 'Card não entrou no canônico no nascimento com o código original'; END IF;

  SELECT to_jsonb(c) INTO v_antes FROM public.bling_card_canonico c WHERE sku = v_codigo;
  INSERT INTO public.produtos (codigo, bling_id, nome)
  VALUES (v_codigo, v_bling || '-duplicado', 'Duplicata de teste');
  IF (SELECT to_jsonb(c) FROM public.bling_card_canonico c WHERE sku = v_codigo)
    IS DISTINCT FROM v_antes THEN RAISE EXCEPTION 'Duplicata alterou o canônico existente'; END IF;

  UPDATE public.bling_card_canonico SET escolhido_por = 'manual', motivo = 'Escolha manual de teste'
  WHERE sku = v_codigo;
  SELECT to_jsonb(c) INTO v_antes FROM public.bling_card_canonico c WHERE sku = v_codigo;
  UPDATE public.produtos SET bling_id = v_bling || '-alterado' WHERE id = v_id;
  IF (SELECT to_jsonb(c) FROM public.bling_card_canonico c WHERE sku = v_codigo)
    IS DISTINCT FROM v_antes THEN RAISE EXCEPTION 'Atualização alterou a escolha manual'; END IF;

  UPDATE public.produtos SET codigo = v_codigo || '-novo' WHERE id = v_id;
  IF NOT EXISTS (SELECT 1 FROM public.bling_card_canonico
    WHERE sku = v_codigo || '-novo' AND bling_id = v_bling || '-alterado')
    THEN RAISE EXCEPTION 'Atualização do código não registrou o novo canônico'; END IF;

  INSERT INTO public.produtos (codigo, bling_id, nome)
  VALUES (v_codigo || '-sem-id', NULL, 'Teste sem identificador') RETURNING id INTO v_id;
  IF EXISTS (SELECT 1 FROM public.bling_card_canonico WHERE sku = v_codigo || '-sem-id')
    THEN RAISE EXCEPTION 'Identificador nulo criou canônico'; END IF;
  UPDATE public.produtos SET bling_id = v_bling || '-posterior' WHERE id = v_id;
  IF NOT EXISTS (SELECT 1 FROM public.bling_card_canonico
    WHERE sku = v_codigo || '-sem-id' AND bling_id = v_bling || '-posterior')
    THEN RAISE EXCEPTION 'Atualização do identificador não criou canônico'; END IF;

  INSERT INTO public.produtos (codigo, bling_id, nome)
  VALUES (NULL, v_bling || '-nulo', 'Teste código nulo'),
         ('', v_bling || '-vazio', 'Teste código vazio'),
         ('   ', v_bling || '-branco', 'Teste código em branco');
  IF EXISTS (SELECT 1 FROM public.bling_card_canonico
    WHERE bling_id IN (v_bling || '-nulo', v_bling || '-vazio', v_bling || '-branco'))
    THEN RAISE EXCEPTION 'Código vazio ou nulo criou canônico'; END IF;
END $test$;
ROLLBACK;