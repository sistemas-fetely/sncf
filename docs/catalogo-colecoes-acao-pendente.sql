-- Registro da ação para implantação futura. Não aplicado nesta entrega.
INSERT INTO public.acao_superficie (rota, arquivo, rotulo, dispara, guarda_atual, risco, permissao_id, origem)
SELECT '/vendas/produto/conciliacao', 'src/components/acervo/ColecoesNovasCatalogo.tsx',
       'Cadastrar coleção', 'catalogo-dimensao-criar', 'usuario_tem_acao', 'MEDIO', p.id, 'lovable'
FROM public.permissoes_catalogo p
WHERE p.slug = 'acao.produto_importar_planilha_cadastro'
  AND NOT EXISTS (SELECT 1 FROM public.acao_superficie a WHERE a.dispara = 'catalogo-dimensao-criar' AND a.aposentada_em IS NULL);