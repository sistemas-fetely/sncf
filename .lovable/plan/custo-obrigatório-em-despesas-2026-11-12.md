# Custo obrigatório em Despesas

- Adicionar a quarta aba em `/administrativo/despesas?aba=custo-obrigatorio`, preservando as outras abas e sem item de menu.
- Exibir resumo, filtros, busca, tabela mensal e totais; seis meses em 1280px e quatro em 1024px.
- Confirmar/descartar e incluir/editar somente pelas RPCs existentes, protegidas por `acao.despesa_classificar`.
- Preservar linhas decididas na sessão com selo até trocar de filtro; famílias de cartão vêm da dimensão ativa.

## Detalhes técnicos
- Consulta tipada com 60 segundos de atualização, skeleton e erros reais; sem novos `any`.
- Helpers puros testados para meses, células, totais e retenção por sessão.
- Testes, lint e preview autenticado; gravações apenas simuladas, sem banco nem publicação.
