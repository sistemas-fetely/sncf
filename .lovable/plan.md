Investigação read-only. Resultado do grep em `src/pages/` e `src/App.tsx`:

- `vw_resultado_produto` → `src/pages/administrativo/PainelMargem.tsx` → `/administrativo/painel-margem`
- `vw_estoque_shopify_sync` → SEM TELA (só aparece em `src/integrations/supabase/types.ts`). Obs.: existe UI de sync em `src/components/acervo/SincronizacaoEstoqueShopify.tsx`, mas ela consome a edge function `sincronizar-estoque-shopify`, não a view.
- `vw_estoque_shopify_retido` → SEM TELA
- `vw_produto_divergencia_bling` → SEM TELA
- `vw_estoque_onboarding_progresso` → SEM TELA
- `baixa_estoque_pendente` / `vw_baixa_estoque_pendente` → SEM TELA (nenhuma referência em `src/pages/`)
- `sncf_tarefas` (tela que lista tarefas pendentes) → `src/pages/MinhasTarefas.tsx` → `/tarefas` (e também `src/pages/TarefasDoTime.tsx` → `/tarefas/time`)

Sem propostas de mudança.