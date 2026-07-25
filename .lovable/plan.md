Investigação apenas — nenhuma alteração de código proposta.

## 1) Botão "Reanalisar"
- Componente: `src/components/pedidos/CardAnalisePedido.tsx` (linhas 112‑121).
- Usado em: `src/pages/Pedidos/PedidoDetalhe.tsx:1177`.
- Hook: `src/hooks/pedidos/useReanalisarPedido.ts` → RPC **`analisar_pedido_vs_programa`** (não `fn_criar_analise_desde_pedido`). Só recomputa `analise_pedido_status/motivo/detalhes`.
- Não existe no frontend nenhuma ação de "reabrir análise de crédito" em pedido já aprovado. Nenhum caller de `fn_criar_analise_desde_pedido` em `src/`.

## 2) Edição de pagamento — dois dialogs, decisão estrutural por tela

**a) `EditarCondicaoPagamentoDialog` (pré‑materialização)**
- Hook `src/hooks/credito/useAtualizarCondicaoPagamento.ts` → RPC `atualizar_condicao_pagamento`.
- Aberto pelo botão "Alterar pagamento" em `src/pages/Credito/CobrancaDetalhe.tsx:1131` (rodapé da proposta, junto de "Aceitar e materializar"). Render em `:1185`.

**b) `AlterarFormaPagamentoDialog` (pós‑materialização — clona pedido → sufixo `/pgXX`)**
- Chamada da RPC: `src/components/pedidos/dialogs/AlterarFormaPagamentoDialog.tsx:126,135` via `useDuplicarPedidoAlterarPagamento` (`src/hooks/pedidos/useDuplicarPedidoAlterarPagamento.ts`) → RPC **`duplicar_pedido_alterar_pagamento`**. `onSuccess` navega para `/pedidos/{novo_pedido_id}`.
- Aberto em dois pontos:
  - `src/pages/Credito/CobrancaDetalhe.tsx:290` — botão "Alterar pagamento" no header do card "Títulos em aberto" (subcomponente `GerenciarLinksPagamento`, ativo quando já existem `titulo_a_receber`). Render em `:379`.
  - `src/pages/Credito/AguardandoPagamentoDetalhe.tsx:296` — botão "Alterar pagamento" no estágio Aguardando Pagamento. Render em `:306`.

**Como a UI decide entre os dois:** não há um `if (temTitulo)` central. A decisão é por **contexto/tela**:
- Em `CobrancaDetalhe`, enquanto exibe a *proposta* (bloco Aceitar/Materializar) → abre `EditarCondicaoPagamentoDialog` (`atualizar_condicao_pagamento`).
- Em `CobrancaDetalhe` quando já entrou no modo `GerenciarLinksPagamento` (títulos existem), ou em `AguardandoPagamentoDetalhe` → abre `AlterarFormaPagamentoDialog` (`duplicar_pedido_alterar_pagamento`).
- O único metadado passado é `temTitulosComEmailEnviado` (calculado em `CobrancaDetalhe.tsx:384`; `false` fixo em `AguardandoPagamentoDetalhe.tsx:311`), usado só para um alerta dentro do dialog (`AlterarFormaPagamentoDialog.tsx:257`), não para trocar RPC.

## 3) "Voltar para cobrança"
- Dialog: `src/components/pedidos/dialogs/ReverterParaCobrancaDialog.tsx`.
- Hook: `src/hooks/pedidos/useReverterParaCobranca.ts` → RPC **`reverter_para_cobranca`**. `onSuccess` navega para `/recebimento/cobranca/{pedidoId}`.
- Botões que abrem:
  - `src/pages/Pedidos/PedidoDetalhe.tsx:176‑182`.
  - `src/pages/Credito/AguardandoPagamentoDetalhe.tsx:288‑316`.

Nenhum outro caller de `reverter_para_cobranca` em `src/`.

## Próximo passo
Aguardo instrução sobre qual mudança planejar em cima desse mapa.
