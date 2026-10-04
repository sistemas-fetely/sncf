# Painel da Chegada de Mercadoria — uma lista só (embarque com pedidos expansíveis)

Só fusão de tela. Nenhuma view, função, RPC, tabela ou migração nova. Outras abas intactas.

## O que muda para o usuário
- Some o seletor "Por pedido / Por embarque". O Painel passa a ter uma tabela só.
- Grupo **"Sem embarque"** no topo, com os pedidos que não estão em nenhum embarque.
- Depois, uma linha por embarque: ref (D008/26), status, ETA ou data de chegada, dias para ETA, contêineres, FOB (USD), nº de pedidos e o alerta de data furada.
- Seta em cada embarque: abre embaixo os pedidos dele (número + sigla da fábrica, fornecedor, proforma / invoice / packing list, status, kits, caixas inner/master, CBM, FOB, ETD, ETA, centro de destino). Pedido parcial ganha o selo "parcial" em cada embarque onde aparece.
- Clicar num pedido abre o mesmo detalhe de hoje (`/vendas/produto/chegada-mercadoria/{id}`). Clicar num embarque abre o mesmo painel lateral de edição de hoje (com contêineres e "registrar chegada").
- KPIs do topo iguais. "Data furada" liga/desliga o filtro da tabela (só embarques com alerta), sem trocar de visão.
- Ordem: embarques não entregues por ETA mais próxima (sem ETA no fim); depois os entregues, chegada mais recente primeiro. Pedidos dentro do embarque por ETA e depois número.
- Busca e filtros que já existem no Por embarque (busca, status, porto, fábrica, só em trânsito) continuam valendo; a busca também casa número de pedido e fornecedor.

## Links antigos
- `?aba=embarques` e `?aba=acompanhamento` continuam indo para a aba Painel, mas sem gravar mais `visao`.
- `?visao=...` passa a ser ignorado (e removido da URL ao mexer no filtro).

## Detalhes técnicos
Fontes (só leitura, todas já usadas hoje):
- Linhas-mãe: `vw_importacao_embarque_painel` (via `useEmbarquePainel`) para ETA/dias/contêineres/FOB/alerta, combinada com a consulta de `importacao_embarque` que o `EmbarquesTab` já faz (`SELECT_EMBARQUE`, com vínculos `importacao_embarque_pedido` → `importacao_pedido`, incluindo `parcial`) — necessária para o painel de edição e para saber os pedidos de cada embarque.
- Linhas de pedido: `vw_importacao_pedido_detalhe` + dimensões que `CadastroPedidoCompra` já carrega (fornecedor, centro, status, fábrica), indexadas por id. "Sem embarque" = pedidos dessa view cujo id não aparece em nenhum vínculo.
- Antes de codar, conferir quais colunas pedidas (proforma, invoice, packing list, kits, caixas, CBM, ETD) já existem em `vw_importacao_pedido_detalhe` / `importacao_pedido`; o que não existir em nenhuma das duas fica "—" e é listado no fim (sem criar coluna).

Arquivos:
- `src/components/compras/EmbarquesTab.tsx` → vira a tabela única (renomeado para `PainelLista.tsx`): reaproveita `PainelEdicao`, `useDimensoes`, `useEmbarques`, `registrarChegada`, filtros e o Sheet; a área expandida passa a listar os pedidos; carrega os pedidos da view de detalhe.
- `src/components/compras/PainelTab.tsx` → tira ToggleGroup e `setVisao`; card "Data furada" alterna `furada=1`; renderiza a lista única.
- `src/pages/acervo/ChegadaMercadoria.tsx` → só o efeito de compatibilidade (não setar `visao`).
- `src/pages/acervo/CadastroPedidoCompra.tsx` → remover o bloco `vista === "acompanhamento"` e as consultas/estados usados só por ele (a vista "novo" segue usada pela aba "Novo pedido"); `VistaCompras` fica só `"novo"`.
- `src/lib/compras/embarque-painel.ts` → só atualizar comentário.
- Removido: `src/components/compras/EmbarquesTab.tsx` (conteúdo movido).

Padrão de tabela: cabeçalho sticky, `overflow-auto max-h-[calc(100vh-18rem)]`, primeira coluna sticky (como no HistoricoPrecoTab). Erros de carga aparecem na tela com a mensagem real.

Validação: typecheck, abrir a aba no preview, expandir D008/26, clicar pedido e embarque, testar "Data furada" e `?aba=embarques`. Não publicar. Lista final de arquivos alterados/removidos na resposta.
