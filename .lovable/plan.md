# Reconstrução da Mesa do Produto

## O que será preservado
- Leitura das duas views, busca, 53 colunas atuais, link para a Ficha, alerta de campos fora do espelho e selos B/S/X.
- Exportação do recorte, ordenação, paginação 50/100/200/500 e ações de promover/descontinuar com os três tratamentos 409/422/502.
- Dicionário de divergências e o de-para SNCF/Bling/XPM.

## Implementação
1. Unir as linhas de `vw_produto_mesa_lista` e `vw_produto_conciliacao` por SKU, mantendo uma linha por produto.
2. Substituir as abas pelas cinco faixas: cabeçalho com estado e ações; cinco indicadores clicáveis; filtros cruzados; tabela única; rodapé existente.
3. Criar filtros multi-seleção de situação, fase, coleção, grupo e sistemas, com contagem facetada calculada aplicando todos os demais filtros.
4. Manter busca e ordenação, acrescentar divergências como colunas opcionais e disponibilizar o de-para pela expansão de qualquer linha divergente.
5. Tornar Código de Cadastro e Código SKU fixos na rolagem horizontal e manter Ações fixa à direita; ajustar densidade, chips, estado vazio, erro e esqueleto conforme o manual.
6. Evoluir o seletor de colunas para ligar/desligar e reordenar por arrastar com HTML5 nativo; “Padrão” restaura visibilidade e ordem. A mesma ordem alimentará o CSV.
7. Validar tipos e a tela em navegador, incluindo os cinco indicadores e os contadores diretos de `sugestao`, sem banco e sem publicação.

## Decisões técnicas
- O filtro “Com divergência” usa `qtd_divergencias > 0` após a junção por SKU.
- O card Total remove apenas o filtro de situação rápida; os demais filtros continuam ativos.
- O estado dos filtros e das colunas permanece somente em React, sem armazenamento no navegador.
- O dicionário `DIC_DIV` permanece no mesmo arquivo e sem alteração de conteúdo.