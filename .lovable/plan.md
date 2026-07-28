# Investigação read-only — inventário de literais de status de CPR

Você pediu inventário, não alteração. O detalhamento (tabelas por categoria A/B/C/D/E, mapas STATUS_LABEL encontrados, divergências entre eles) foi entregue na mensagem do chat.

## Achados-chave

- **Nenhuma escrita** de `paga` / `previsto` / `agendado` em `contas_pagar_receber.status` a partir do front. A única escrita direta com um desses literais é `sync-contas-receber` (edge Bling) gravando `atrasado`; `compromissos-handler` só usa `previsto` como filtro, não como valor gravado.
- **Leitura de `previsto`** em três pontos: `compromissos-handler` (L143, L241) e `FluxoCaixaFuturo` (L143).
- **Leitura de `atrasado`/`agendado`** como estado de UI/legado em `ContaPagarDetalheDrawer` e `StatusProgressBar`.
- **Três mapas STATUS_LABEL independentes e divergentes** para CPR: `ContasPagar.tsx` (L81), `ContaPagarDetalheDrawer.tsx` (L109), `TimelineHistorico.tsx` (L10). Não há mapa central.
- Todo o conjunto do módulo Crédito (`Credito/*`, `useTitulosCobranca`, `useReguaFila`, `ContasReceber`, `PainelFinanceiroConta`) usa `status_gestao` (view derivada), não `status` cru — separei explicitamente em (D).

## Próximo passo

Quando quiser agir sobre isso, me diga o objetivo (ex.: criar mapa canônico, alinhar rótulos, cobrir gaps como `paga`/`previsto` faltando nos badges, ou eliminar literais soltos) e eu volto com plano de implementação.
