# Inventário — filtros de seleção única (coleção, grupo, fase, situação de produto)

Só leitura. Nada foi editado. Fica de fora o Cockpit do Estoque.

| Tela (menu) | Rota | Arquivo | Filtros | Onde filtra | Fonte das opções |
|---|---|---|---|---|---|
| Produtos · Margem e Capital | /bi/produtos | src/pages/administrativo/Produtos.tsx | Coleção, Grupo, Fase | Cliente | Coleção/grupo: valores distintos da lista carregada (vw_produto_cockpit). Fase: valores distintos da lista, ordenados por produto_fase_dim |
| Painel de Margem | /administrativo/painel-margem | src/pages/administrativo/PainelMargem.tsx | Grupo, Coleção | Cliente | Valores distintos de vw_resultado_produto já carregada |
| Faturamento | /administrativo/faturamento | src/pages/administrativo/Faturamento.tsx | Coleção | Cliente | Valores distintos das linhas carregadas |
| Tabela de Preço | /vendas/produto/precos | src/pages/acervo/TabelaPreco.tsx | Coleção, Grupo, Fase | Cliente | Valores distintos de vw_preco_espelho |
| Tabela de Preço › aba Histórico | /vendas/produto/precos (aba) | src/components/acervo/HistoricoPrecoTab.tsx | Coleção, Grupo | Cliente | Valores distintos de vw_preco_historico_analise |
| Central de Estoque | /vendas/produto/estoque/central | src/pages/Comercial/CentralEstoque.tsx | Coleção, Fase | Cliente (helper filtrar) | Valores distintos dos produtos carregados |
| Conciliação de Cadastro › Atualização do catálogo | /vendas/produto/conciliacao | src/components/acervo/AtualizacaoCatalogoDia.tsx | Fase | Cliente | Lista fixa no código: registrado, pre_venda, ativo, inativo |

Nenhuma dessas telas filtra no servidor com .eq.

## Fora do critério (não é filtro de produto)
- Parceiros: "Todos os grupos" é grupo empresarial.
- Gerar título de NF, aba Pedidos Fiscais e Cartório de Códigos: "Todas as situações" é situação de nota, de pedido ou de código.
- Estoque Site SP e Envio do cadastro (BlingCardPainel): já são de seleção múltipla.

## Observação
A fase de Atualização do catálogo é a única lista fixa no código; todas as outras opções vêm dos dados carregados.
