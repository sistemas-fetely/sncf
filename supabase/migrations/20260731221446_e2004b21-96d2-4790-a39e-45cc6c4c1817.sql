DROP VIEW IF EXISTS public.vw_qualidade_painel;

CREATE VIEW public.vw_qualidade_painel
WITH (security_invoker = on) AS
SELECT r.slug, r.modulo, r.titulo, r.o_que_significa, r.severidade,
       r.objeto, r.link_acao, r.ordem,
       m.contagem, m.erro, m.medido_em,
       CASE WHEN m.medido_em IS NULL      THEN 'nunca_medido'
            WHEN m.erro IS NOT NULL       THEN 'nao_medido'
            WHEN COALESCE(m.contagem,0)=0 THEN 'limpo'
            ELSE r.severidade END AS estado,
       (SELECT mp.contagem FROM public.qualidade_medicao mp
         WHERE mp.regra_slug = r.slug AND mp.erro IS NULL AND mp.medido_em < m.medido_em
         ORDER BY mp.medido_em DESC LIMIT 1) AS contagem_anterior
FROM public.qualidade_regra r
LEFT JOIN LATERAL (
  SELECT contagem, erro, medido_em FROM public.qualidade_medicao q
   WHERE q.regra_slug = r.slug ORDER BY q.medido_em DESC LIMIT 1) m ON true
WHERE r.ativo;

GRANT SELECT ON public.vw_qualidade_painel TO authenticated;
GRANT SELECT ON public.vw_qualidade_painel TO service_role;