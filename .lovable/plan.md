# Aba "Problemas Cobrança" — separar problema de carteira

## Antes de tudo: uma divergência que precisa da sua decisão

Levantei o código e o banco antes de escrever qualquer coisa. O que encontrei não bate com a premissa do pedido:

- A aba "Problemas Cobrança" da tela de Cobrança (`src/pages/Credito/CobrancaFila.tsx`, conteúdo em `src/pages/Credito/SemProvaTab.tsx`) **não consome `vw_pedido_lastro_cobranca`**. Ela lê `vw_cobranca_mesa` (hooks em `src/hooks/credito/useSemProvaFila.ts`), filtrando as filas `PAGO_SEM_PROVA`, `A_REEMITIR_BOLETO`, `A_EMITIR_BOLETO`, `EMAIL_BLOQUEADO`, `A_ENVIAR` e cartão em `CONCILIAR`.
- O único lugar que hoje consome `vw_pedido_lastro_cobranca` é a **coluna "Cobrança" da tabela de fila de pedidos** (`src/components/pedidos/FilaPedidosPorArea.tsx`, query `pedido-lastro-cobranca`).
- Os dois dão 56 por coincidência: a aba conta 56 linhas de `vw_cobranca_mesa` (33 pedidos distintos), e `vw_pedido_lastro_cobranca` tem 56 linhas (7 com `eh_problema`, R$ 61.899,52; 49 sem, R$ 232.954,03 — exatamente os seus números).
- Cruzando as duas: das 56 linhas da aba, **50 não têm pedido correspondente** em `vw_pedido_lastro_cobranca`. São conjuntos diferentes, em granularidades diferentes (título x pedido).

Ou seja: trocar a fonte da aba por `eh_problema` não "corrige o contador" — troca o conteúdo da aba por outro universo de linhas.

## Duas saídas — escolha uma

### Opção A — a aba passa a ser sobre pedidos (fonte única `vw_pedido_lastro_cobranca`)
A aba "Problemas Cobrança" deixa de listar títulos de `vw_cobranca_mesa` e passa a listar pedidos da view corrigida, com `eh_problema = true` (7). A aba nova "Carteira" mostra os `eh_problema = false` (49), com o mesmo layout. O conteúdo atual da aba (sem prova, instrumento quebrado, cartão a conciliar, não cobrável) **sai da tela** — precisa dizer para onde vai, porque hoje ele é a única superfície desses casos.

### Opção B — manter a aba como está e usar `eh_problema` onde a view já é lida
A aba atual (títulos de `vw_cobranca_mesa`) fica intocada, e a separação problema/carteira entra na coluna "Cobrança" da fila de pedidos, mais uma aba/filtro "Carteira" ali. Não mexe no contador 56 da aba.

## Implementação (assumindo Opção A)

Arquivos a alterar:

1. `src/hooks/credito/useSemProvaFila.ts` — novo hook `usePedidoLastroCobranca(ehProblema: boolean)`: `select("*").eq("eh_problema", ehProblema)` em `vw_pedido_lastro_cobranca`, FAIL-LOUD (`throw error`), mesma configuração de `staleTime`/`refetchOnWindowFocus` dos hooks vizinhos. Nenhum filtro por `lastro`/`lastro_rotulo` em TypeScript.
2. `src/pages/Credito/SemProvaTab.tsx` — o componente recebe `ehProblema: boolean` (default `true`) e alimenta a mesma tabela/cards já existentes com as linhas da view, sem novo design, sem cards inventados.
3. `src/pages/Credito/CobrancaFila.tsx` — o contador de "Problemas Cobrança" passa a vir do hook com `eh_problema = true`; entra um item novo `Carteira` na mesma `TabsList`, com a mesma classe `tabTriggerCls` e o mesmo padrão de rótulo (`Carteira · N`), renderizando o mesmo componente com `ehProblema = false`. Nenhuma outra aba tocada.
4. `src/integrations/supabase/types.ts` — **nada a fazer**: `eh_problema: boolean | null` já consta em `vw_pedido_lastro_cobranca` nos tipos gerados (verificado).

Sem migration, sem SQL, sem RLS. Type-check ao final.

## Pergunta

Opção A ou B? E, se A, para onde vai o conteúdo atual da aba (sem prova / instrumento quebrado / cartão a conciliar / não cobrável)?
