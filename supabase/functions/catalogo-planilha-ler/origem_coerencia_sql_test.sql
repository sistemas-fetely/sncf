-- Teste sem escrita: usa um produto existente apenas como linha-base do validador.
\set ON_ERROR_STOP on
DO $$
DECLARE
  v_cod text;
  v_motivo text;
BEGIN
  SELECT cod_cadastro INTO v_cod FROM public.sncf_produtos ORDER BY cod_cadastro LIMIT 1;
  IF v_cod IS NULL THEN RAISE EXCEPTION 'FALHOU: teste exige ao menos um produto cadastrado'; END IF;

  SELECT motivo INTO v_motivo
  FROM public.fn_produto_formato_validar_patch(v_cod, '{"origem_fisc":"1","origem_prod":"Nacional"}'::jsonb)
  WHERE campo = 'origem_fisc';
  IF v_motivo IS DISTINCT FROM 'Origem fiscal 1 é de produto importado, mas a origem do produto está Nacional. Produto nacional usa origem fiscal 0; se o produto é importado, volte a origem do produto para Importado (origens 1 e 2).' THEN
    RAISE EXCEPTION 'FALHOU: orientação para produto nacional: %', coalesce(v_motivo, 'sem mensagem');
  END IF;

  SELECT motivo INTO v_motivo
  FROM public.fn_produto_formato_validar_patch(v_cod, '{"origem_fisc":"0","origem_prod":"Importado"}'::jsonb)
  WHERE campo = 'origem_fisc';
  IF v_motivo IS DISTINCT FROM 'Origem fiscal 0 é de produto nacional, mas a origem do produto está Importado. Produto importado usa 1 (importação direta) ou 2 (comprado no mercado interno); se é nacional, mude a origem do produto para Nacional.' THEN
    RAISE EXCEPTION 'FALHOU: orientação para produto importado: %', coalesce(v_motivo, 'sem mensagem');
  END IF;

  RAISE NOTICE 'PASSOU: mensagens orientam a correção nos dois sentidos';
END $$;
