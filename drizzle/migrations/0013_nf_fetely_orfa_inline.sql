CREATE OR REPLACE VIEW public.vw_nf_fetely_orfa WITH (security_invoker = true) AS
SELECT n.id, n.numero, n.serie, n.situacao, n.data_emissao, n.emitente_cnpj,
  cd.id AS origem_centro_id, cd.codigo AS origem_codigo, cd.rotulo_curto AS origem_rotulo,
  (SELECT array_agg(DISTINCT i->>'cfop' ORDER BY i->>'cfop') FROM jsonb_array_elements(coalesce(n.itens_json,'[]'::jsonb)) i) AS cfops,
  jsonb_array_length(coalesce(n.itens_json,'[]'::jsonb)) AS qtd_itens,
  (SELECT coalesce(sum((i->>'quantidade')::numeric),0) FROM jsonb_array_elements(coalesce(n.itens_json,'[]'::jsonb)) i) AS pecas,
  n.valor_nota, n.chave_acesso, n.pdf_url,
  n.transferencia_ignorada_em, n.transferencia_ignorada_por, n.transferencia_ignorada_motivo,
  (n.transferencia_ignorada_em IS NOT NULL) AS ignorada
FROM public.nfs_emitidas n
JOIN public.parceiros_comerciais pc ON pc.id = n.parceiro_id
  AND left(regexp_replace(coalesce(pc.cnpj,''),'\D','','g'),8) = '63591078'
LEFT JOIN public.centro_distribuicao cd ON cd.cnpj_emitente = n.emitente_cnpj
WHERE n.tipo = 'saida'
  AND n.pedido_venda_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.transferencia_remessa_vinculo v WHERE v.nf_remessa_id = n.id);
GRANT SELECT ON public.vw_nf_fetely_orfa TO authenticated, service_role;