## Reconhecimento do que já existe no repo (verificado agora)

**Estoque Geral (CASA > SOPS > PRODUTO > ESTOQUE)**
- Container de abas: `src/layouts/ProdutoEstoqueLayout.tsx` — abas via `NavLink` para `/vendas/produto/estoque/{virtual,saude,devolucoes,conciliacao}`.
- Aba "Estoque Geral": `src/pages/Comercial/EstoqueVirtual.tsx` (rota `/vendas/produto/estoque/virtual`).
- Aba "Saúde do Estoque": `src/pages/acervo/SaudeEstoque.tsx`.
- Layout externo: `VendasLayout` + `VendasSidebar`; cabeçalho padrão `CasaPageHeader` com breadcrumb Casa > SOPs > Produto > Estoque.
- Recebimento XPM: `src/pages/vendas/xpm/RecebimentoXpm.tsx`, agregado em `src/pages/vendas/xpm/XpmIndex.tsx`; `/acervo/estoque/recebimento-xpm` redireciona para a rota de vendas.

**Convenção de dados do projeto**
- Leitura: `useQuery` do React Query, `queryKey` com o nome da view, `.from("<view>").select("<colunas explícitas>")`, cast `(supabase as any)` porque views não estão nos tipos gerados, `throw error`.
- Escrita: `useMutation` com `await`, `throw` no erro e `toast` (sonner), `invalidateQueries` no `onSuccess`.
- Tabela: `Table` do shadcn + `SortableTableHead`/`ordenarPor`, filtros com `FilterInput`/`FilterSelectTrigger`, paginação em estado local (sem storage).

## Estado atual: as duas telas já foram materializadas na sessão anterior

Arquivos que existem hoje e implementam exatamente o pedido:

- `src/lib/estoque/status-venda.ts` — mapa único de rótulos e classes dos 7 valores de `status_venda`.
- `src/hooks/estoque/useDevolucoesRetornoPendente.ts` — lê `vw_devolucao_retorno_pendente` e agrupa por pedido.
- `src/hooks/estoque/useEstoqueCondicoes.ts` — lê `estoque_condicao` (ativo) → `codigo`/`rotulo`.
- `src/hooks/estoque/useRegistrarRetornoDevolucao.ts` — RPC `registrar_retorno_devolucao`, com invalidação das queries de estoque.
- `src/components/estoque/ConferirRetornoDialog.tsx` — conferência por SKU (qtd + condição), NF, data, centro (default `XPM-SC`), obs; toast com a mensagem crua do banco e exibição do campo `aviso`.
- `src/pages/estoque/RetornoDevolucao.tsx` — lista agrupada por pedido com dias esperando, unidades e custo pendente.
- `src/components/estoque/DetalheEstoqueSkuSheet.tsx` — drawer por SKU com `vw_estoque_centro` e `vw_estoque_posicao` (`furo_a_investigar` nulo = "esperado").
- `src/pages/Comercial/EstoqueVirtual.tsx` — migrado para `vw_estoque_rede`: tag "Saldo Bling" removida, Bling vira coluna de referência (`referencia_bling` + `delta_bling`), alarme e contador de "Vendido sem lastro", coluna Chegada com `pedido_importacao` e `eta_prevista` (ou `status_importacao` + "sem data de ETA"), colunas separadas de não vendável e Show Room.
- Navegação: aba "Retorno de devolução" em `ProdutoEstoqueLayout.tsx` e rota `/vendas/produto/estoque/devolucoes` em `src/App.tsx`.

Typecheck passou sem erros. Nenhum SQL foi criado ou alterado. Nenhum uso de localStorage/sessionStorage.

## O que proponho como próximo passo (esta rodada)

Nada de novo a construir do zero — falta validar contra dados reais e ajustar o que a realidade contradisser:

1. Abrir `/vendas/produto/estoque/devolucoes` e conferir se os 2 pedidos / 224 unidades aparecem com dias esperando e custo corretos.
2. Abrir `/vendas/produto/estoque/virtual` e conferir: contador de "Vendido sem lastro" deve bater 6 SKUs / 105 unidades; nenhum rótulo cru de `status_venda`; os 3 pedidos em trânsito sem ETA devem mostrar `status_importacao`.
3. Ajustar o cálculo do contador de unidades sem lastro se ele não bater 105 — hoje ele usa `reservado_aguardando_produto` com fallback em `reservado`, o que é uma escolha minha, não um dado da view.
4. Registrar um retorno parcial de teste para confirmar que o `aviso` da RPC aparece e que erro do banco chega ao toast sem tradução.

## Detalhes técnicos

- Dado ausente que não inventei: a view `vw_devolucao_retorno_pendente` não expõe nome de cliente, então a lista identifica o pedido por `id_externo` e NF.
- "Vendido sem lastro": a view não traz coluna de unidades prometidas; se você quiser o número exato (105) no contador, precisa me dizer qual coluna representa isso ou disponibilizá-la.
- `p_data` é enviado como ISO a partir da data escolhida no dialog (meio-dia local, para não escorregar de dia por fuso).
