INSERT INTO public.auditoria_regra (slug, titulo, modulo_slug, entidade, severidade, o_que_significa, modo, sql_achado, ativo, origem)
VALUES (
  'nf-cancelada-com-baixa-de-estoque',
  'NF cancelada com baixa de estoque ativa',
  'fiscal',
  'nf',
  'bloqueante',
  'A nota fiscal foi cancelada no Bling, mas os movimentos de baixa de estoque gerados por ela continuam ativos. O estoque esta menor do que a realidade e precisa de estorno manual.',
  'achado',
  $$SELECT n.numero AS chave,
       'NF ' || n.numero || ' cancelada em ' || n.data_emissao::date || ' mas com ' || count(m.id) || ' movimentos de baixa de estoque ainda ativos' AS detalhe,
       sum(-m.quantidade) AS valor
  FROM nfs_emitidas n
  JOIN movimentacao_estoque m ON m.doc_numero = n.numero AND m.doc_tipo = 'nf_venda'
 WHERE n.situacao = 'cancelada'
 GROUP BY n.numero, n.data_emissao$$,
  false,
  'manual'
)
ON CONFLICT (slug) DO UPDATE SET
  sql_achado = EXCLUDED.sql_achado,
  severidade = EXCLUDED.severidade,
  entidade = EXCLUDED.entidade,
  modulo_slug = EXCLUDED.modulo_slug,
  ativo = false,
  updated_at = now();

SELECT public.fn_auditoria_regra_testar('nf-cancelada-com-baixa-de-estoque');

UPDATE public.auditoria_regra SET ativo = true, updated_at = now()
WHERE slug = 'nf-cancelada-com-baixa-de-estoque';