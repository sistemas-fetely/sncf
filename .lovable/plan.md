
Investigação read-only. Nada a alterar. Inventário abaixo.

## 1. `fn_fluxo_caixa_projetado` (RPC)
- **Chamador único:** `src/pages/administrativo/FluxoCaixa.tsx:52` (dentro do hook `useQuery` com key `["fluxo-caixa", horizonte, saldoInicialOverride]`, linha 50).
- **Rota:** `src/App.tsx:602` → `<Route path="fluxo-caixa" element={<FluxoCaixa />} />` (dentro de `/administrativo`). Rota acessível.
- **Menu:** `src/components/AdminFinanceiroSidebar.tsx:43` ("Fluxo de Caixa", grupo Financeiro) + `src/components/financas/FinancasContextSidebar.tsx:62` + `src/components/navegacao/CommandPalette.tsx:56`. Visível em ambas as sidebars e no palette.

## 2. `vw_fluxo_caixa_futuro`
- **Leitor:** nenhum. Referência aparece só em `src/integrations/supabase/types.ts:24223` (tipo gerado). Nenhum `.from("vw_fluxo_caixa_futuro")` no código.
- Observação: existem `queryKey: ["fluxo-caixa-futuro"]` sendo invalidados em `Compromissos.tsx:213,224`, `DialogNovoParceladoManual.tsx:162`, `DialogNovoRecorrente.tsx:206` — mas essa key **não corresponde a nenhuma query registrada** (a tela `FluxoCaixaFuturo.tsx` usa keys `parcelas-previstas`, `compromissos-parcelados`, `compromissos-recorrentes-ativos`). Invalidations órfãs.

## 3. `vw_fluxo_futuro_investimento`
- **Leitor único:** `src/pages/administrativo/FluxoFuturoInvestimento.tsx:73` (`.from("vw_fluxo_futuro_investimento")`, queryKey `["fluxo-futuro-investimento"]`, linha 70).
- **Rota:** `src/App.tsx:629` → `fluxo-futuro-investimento`. Acessível.
- **Menu:** `AdminFinanceiroSidebar.tsx:48` + `FinancasContextSidebar.tsx:110`.

## 4. `vw_contas_pagar_consolidado`
- **Leitores:**
  - `src/pages/administrativo/ContasPagar.tsx:112` (fonte principal da tela Contas a Pagar).
  - `src/lib/financeiro/get-status-flags.ts:31` (helper de flags `tem_doc_pendente` / `atrasada`, usado onde CPR precisa desses campos que a view expõe e a tabela não).
- Aparece extensivamente em `types.ts` só como `referencedRelation`.

## 5. `vw_previsao_recebimentos`
- **Leitor único:** `src/pages/administrativo/PrevisaoRecebimentos.tsx:95` (`.from("vw_previsao_recebimentos")`, queryKey `["vw-previsao-recebimentos"]`, linha 91).
- **Rota:** `src/App.tsx:628` → `previsao-recebimentos`. Acessível.
- **Menu:** `AdminFinanceiroSidebar.tsx:50` + `FinancasContextSidebar.tsx:85`.

## 6. `src/pages/administrativo/FluxoCaixaFuturo.tsx`
- **Rota:** `src/App.tsx:627` → `<Route path="fluxo-futuro" element={<FluxoCaixaFuturo />} />`. Acessível em `/administrativo/fluxo-futuro`.
- **Menu:** `AdminFinanceiroSidebar.tsx:49` ("Fluxo Futuro") + `FinancasContextSidebar.tsx:109`.
- **Fonte de dados:** **não usa** `fn_fluxo_caixa_projetado` nem `vw_fluxo_caixa_futuro`. Faz três queries próprias diretas em tabelas:
  - `contas_pagar_receber` filtrando `status='previsto'` + tipo `pagar` (parcelas previstas).
  - `compromissos_parcelados`.
  - `compromissos_recorrentes`.
- Prefetch listado em `src/hooks/usePrefetchTelas.ts:49`.

## Aba "Caixa" ao lado de "Gerencial" em Movimentações?
- Não existe. `src/pages/administrativo/CaixaBanco.tsx` foi reduzida a uma única visão **Gerencial** (título e cabeçalho na linha 421; comentário do topo linhas 2 e 11-12 confirmam que `MovimentacoesGerencial` e o hook antigo foram removidos em 27/07/2026). As únicas abas hoje são as de agrupamento (`ABAS` em CaixaBanco.tsx:408): "Por Natureza / Por Plano de Contas / Por Centro de Custo". Não há aba "Caixa" nem tela alternativa mostrando "fluxo de caixa por vencimento" fora das quatro telas dedicadas listadas acima (`FluxoCaixa`, `FluxoCaixaFuturo`, `FluxoFuturoInvestimento`, `PrevisaoRecebimentos`).

## Resumo do estado por objeto
| Objeto | Consumidor | Rota | Menu | Status |
|---|---|---|---|---|
| `fn_fluxo_caixa_projetado` | FluxoCaixa.tsx:52 | /administrativo/fluxo-caixa | sim (2 sidebars + palette) | ativo |
| `vw_fluxo_caixa_futuro` | nenhum | — | — | **órfão** (só em types.ts; keys `fluxo-caixa-futuro` invalidam nada) |
| `vw_fluxo_futuro_investimento` | FluxoFuturoInvestimento.tsx:73 | /administrativo/fluxo-futuro-investimento | sim | ativo |
| `vw_contas_pagar_consolidado` | ContasPagar.tsx:112, get-status-flags.ts:31 | /administrativo/contas-pagar | sim | ativo |
| `vw_previsao_recebimentos` | PrevisaoRecebimentos.tsx:95 | /administrativo/previsao-recebimentos | sim | ativo |
| `FluxoCaixaFuturo.tsx` | — | /administrativo/fluxo-futuro | sim | **não lê RPC nem view**; usa 3 queries próprias em tabelas |
