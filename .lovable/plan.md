# Inventário (só leitura — nenhuma alteração proposta)

## 1) Consumidores de `vw_lancamentos_caixa_banco`

**Nenhum consumidor no frontend.** A view só aparece em:

- `src/integrations/supabase/types.ts:25280` — `vw_lancamentos_caixa_banco: {` (tipo auto-gerado).
- `src/lib/financeiro/get-status-flags.ts:4` — ` * mas não estão expostas em outras views (ex: vw_lancamentos_caixa_banco).` (comentário).
- `supabase/migrations/20260531010000_baseline_foto_schema_completa.sql:12832` — `CREATE OR REPLACE VIEW public.vw_lancamentos_caixa_banco AS` (DDL).

Nenhum `.from("vw_lancamentos_caixa_banco")` em `src/` nem em `supabase/functions/`. Sem `.select()` a inventariar.

**Rota/menu:** a tela `/administrativo/caixa-banco` existe (`src/App.tsx:622` — `<Route path="caixa-banco" element={<CaixaBanco />} />`; item no menu em `src/components/financas/FinancasContextSidebar.tsx:62` — `<FinancasSidebarItem to="/administrativo/caixa-banco" icon={PieChart} label="Gerencial" end />`), mas o componente `src/pages/administrativo/CaixaBanco.tsx` lê de `vw_despesas_v2` (linha 170), **não** de `vw_lancamentos_caixa_banco`. Ou seja: a view existe no banco e no schema TS, porém está órfã na app.

Observação lateral: 12 arquivos invalidam a queryKey `["lancamentos-caixa-banco"]` (grep abaixo), mas **nenhum `useQuery` declara essa chave hoje** — invalidações sem produtor. Arquivos: `EditarLancamentoDialog.tsx:108`, `BuscarNFStageDialog.tsx:270`, `DespesaDiretaDialog.tsx:125`, `AcoesInlineConta.tsx:201`, `ConfirmarMatchDialog.tsx:144`, `AdicionarDocumentoDialog.tsx:191`, `ConciliarLoteDialog.tsx:121`, `AcaoMassaSuperAdminDialog.tsx:136`, `FilaRevisaoIADialog.tsx:157`, `ImportarOFXDialog.tsx:226`, `MarcarPagoDialog.tsx:178`, `ContaPagarDetalheDrawer.tsx:158`.

---

## 2) `status_caixa` — separado por fonte

### 2a) `status_caixa` VINDO de `vw_lancamentos_caixa_banco`
**Zero uso na app.** Como não há consumidor da view (item 1), não existe comparação, filtro, mapa de rótulo/cor, aba, KPI, nem agrupamento que dependa desse `status_caixa` específico. Um valor novo (`'parcialmente_pago'`) na coluna dessa view não afeta nenhuma tela hoje — porque nenhuma tela lê dela.

### 2b) Homônimo em `vw_despesas_v2` (para não confundir)
- `src/pages/administrativo/Despesas.tsx:57` — `status_caixa: string | null;` (tipo `DespesaV2`).
- `src/pages/administrativo/Despesas.tsx:229` — `const pagas = filtradas.filter((r) => r.status_caixa === "pago").length;` — usado só num KPI "% pagas". Sem mapa de rótulo/cor, sem filtro/aba/agrupamento. Um valor `'parcialmente_pago'` **não sumiria linhas**: só não contaria no KPI "pagas" (fallback silencioso — a linha continua aparecendo na tabela, apenas fora da contagem).
- `src/pages/administrativo/CaixaBanco.tsx:66` — `status_caixa: string | null;` (tipo local `DespesaV2`).
- `src/pages/administrativo/CaixaBanco.tsx:175` — declarado no `.select()` de `vw_despesas_v2`, mas **não referenciado no restante do componente** (grep em CaixaBanco.tsx não mostra outro uso). Sem impacto de valores novos.

### 2c) Homônimo em `src/pages/administrativo/CaixaBanco/utils.ts` (arquivo órfão)
- `utils.ts:17` — `status_caixa: "em_aberto" | "pago" | "conciliado";` (união literal fechada no tipo `Lancamento`).
- `utils.ts:52` — `if (l.movimentacao_bancaria_id || l.status_caixa === "conciliado") return "enviado_para_pagamento";`
- `utils.ts:53` — `if (l.status_caixa === "pago") return "enviado_para_pagamento";`

Consumidores do arquivo `CaixaBanco/utils.ts`: **nenhum** — `rg "CaixaBanco/utils"` em `src/` não retorna importadores. Arquivo órfão. Sem mapa de rótulo/cor, sem KPI/aba/filtro em uso. O tipo é uma união fechada; se algum dia for religado a `vw_lancamentos_caixa_banco`, um valor `'parcialmente_pago'` **falharia typecheck** ou cairia no `return "enviado_para_pagamento"` final (fallback catch-all no final de `statusVisual`, linha 56) — silencioso, sem tela para sumir linhas porque não há tela.

**Resumo do item 2:** nenhuma tela viva consome `status_caixa` de `vw_lancamentos_caixa_banco`. Os outros dois `status_caixa` (de `vw_despesas_v2` e do tipo órfão) não têm mapa de rótulo/cor nem filtro/aba/agrupamento; o único uso ativo é o KPI "% pagas" em `Despesas.tsx:229`, que trataria `'parcialmente_pago'` como "não pago" (silencioso, sem esconder linhas).

---

## 3) Campos `mov_conciliada`, `mov_data`, `mov_valor`, `mov_descricao` de `vw_contas_pagar_consolidado`

Consumidor único da view: `src/pages/administrativo/ContasPagar.tsx:116` — `.from("vw_contas_pagar_consolidado").select("*, plano_contas:plano_contas_id(...), ...")` (SELECT * — os campos entram no payload).

Uso desses campos na tela:

- `src/pages/administrativo/ContasPagar.tsx:70` — `mov_conciliada: boolean | null;` — **apenas declarado no tipo `Conta`**. `rg mov_conciliada` no arquivo/JSX não retorna outros hits: **não é exibido nem usado em lógica**.
- `mov_data` — **não declarado nem lido** em `ContasPagar.tsx` (nem no restante de `src/`, exceto `types.ts` e `PagamentosAlocacaoSection.tsx`, que lê da view diferente `vw_pagamento_alocacao_detalhe`).
- `mov_valor` — idem: sem uso em `ContasPagar.tsx`.
- `mov_descricao` — idem: sem uso em `ContasPagar.tsx`.

(As referências em `src/components/financeiro/PagamentosAlocacaoSection.tsx:31,32,36,202,221,261,265` são de `vw_pagamento_alocacao_detalhe`, não de `vw_contas_pagar_consolidado` — fora do escopo desta pergunta.)

**Resumo do item 3:** `vw_contas_pagar_consolidado` é consumida só por `ContasPagar.tsx`; dos quatro campos, apenas `mov_conciliada` está tipado, e mesmo esse não é exibido nem consultado em nenhuma condição/render. `mov_data`, `mov_valor` e `mov_descricao` vêm no `select "*"` e são descartados. Nenhuma tela mostra hoje qualquer um desses quatro campos vindos dessa view.

---

Investigação encerrada. Nenhuma correção proposta — conforme pedido.
