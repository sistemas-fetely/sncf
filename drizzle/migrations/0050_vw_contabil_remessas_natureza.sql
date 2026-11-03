CREATE OR REPLACE VIEW public.vw_contabil_remessas WITH (security_invoker = true) AS
 SELECT r.id, r.tipo,
    COALESCE(r.competencia, f.competencia) AS competencia,
    to_char((COALESCE(r.competencia, f.competencia))::timestamp with time zone, 'MM/YYYY'::text) AS rotulo,
    r.descricao, r.enviada_em, r.destinatarios, r.link_signed, r.link_expira_em,
    (r.link_expira_em < now()) AS link_expirado,
    r.storage_path, r.qtd_documentos, r.observacao, f.unidades, f.valor_custo,
    r.versao, r.status, r.progresso, r.erro_mensagem, r.partes, r.manifesto, r.gerado_em,
    COALESCE(r.gerado_por, r.enviada_por) AS gerado_por,
    ( SELECT p.full_name FROM profiles p WHERE (p.user_id = COALESCE(r.gerado_por, r.enviada_por)) LIMIT 1) AS gerado_por_nome,
    r.natureza,
    nd.rotulo AS natureza_rotulo
   FROM ((remessas_contador r
     LEFT JOIN remessa_contador_natureza_dim nd ON ((nd.codigo = r.natureza)))
     LEFT JOIN contabil_fechamento f ON ((f.id = r.fechamento_id)))
  WHERE (r.tipo = 'fechamento_estoque'::text);