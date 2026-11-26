DO $migration$
DECLARE
  d text;
  alvo text;
BEGIN
  d := pg_get_viewdef('public.vw_shopify_cadastro_fila'::regclass, true);
  alvo := 'p.fase_alterada_motivo,';
  IF (length(d) - length(replace(d, alvo, ''))) / length(alvo) <> 1 THEN
    RAISE EXCEPTION 'Esperava um ponto de inclusão da medição na base Shopify';
  END IF;
  d := replace(d, alvo, $sql$p.fase_alterada_motivo,
  EXISTS (
    SELECT 1 FROM public.produto_ficha_nascimento f
    CROSS JOIN LATERAL (SELECT to_jsonb(p) ->> f.campo AS valor) m
    WHERE f.exigido_para = 'medicao'
      AND CASE
        WHEN m.valor IS NULL OR btrim(m.valor) = '' THEN true
        WHEN btrim(m.valor) ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$'
          THEN btrim(m.valor)::numeric <= 0
        ELSE false
      END
  ) AS aguardando_medicao,$sql$);
  alvo := 'array_remove(ARRAY[';
  IF (length(d) - length(replace(d, alvo, ''))) / length(alvo) <> 1 THEN
    RAISE EXCEPTION 'Esperava uma lista de avisos Shopify';
  END IF;
  d := replace(d, alvo, 'array_remove(ARRAY[CASE WHEN aguardando_medicao THEN ''aguardando_medicao''::text ELSE NULL::text END,');
  alvo := ' AS pode_enviar,';
  IF (length(d) - length(replace(d, alvo, ''))) / length(alvo) <> 1 THEN
    RAISE EXCEPTION 'Esperava uma regra pode_enviar';
  END IF;
  d := replace(d, alvo, ' AND NOT aguardando_medicao AS pode_enviar,');
  alvo := ' AS pode_adicionar_variante,';
  IF (length(d) - length(replace(d, alvo, ''))) / length(alvo) <> 1 THEN
    RAISE EXCEPTION 'Esperava uma regra pode_adicionar_variante';
  END IF;
  d := replace(d, alvo, ' AND NOT aguardando_medicao AS pode_adicionar_variante,');
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_shopify_cadastro_fila AS ' || d;
END $migration$;