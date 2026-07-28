# Inventário (read-only) — sem propostas

## 1. Chamadores de `confirmar_match_despesa`

Único arquivo: `src/pages/administrativo/ConciliacaoDespesas.tsx`

- Linha **248** (lote — `confirmarLote`): passa **3 args** — `p_mov_id`, `p_cpr_id`, `p_user_id`.
- Linha **300** (unitário — `confirmarUm`): passa **3 args** — `p_mov_id`, `p_cpr_id`, `p_user_id`.

Nenhum chamador passa hoje o 4º parâmetro `p_valor`.

## 2. Leitores de `vw_despesas_match_sugestoes`

Único leitor em código de aplicação: `src/pages/administrativo/ConciliacaoDespesas.tsx` linha **141** (query `conciliacao-sug-cpr`), `.select("mov_id, cpr_valor, data_vencimento, data_pagamento, parceiro_nome")`.

Roteamento e menu:
- `src/App.tsx` linha **142** (lazy import) e linha **632** (`<Route path="conciliacao-despesas">`).
- `src/components/financas/FinancasContextSidebar.tsx` linha **96** — item "Conciliar Despesas" → `/administrativo/conciliacao-despesas`.
- Link auxiliar em `src/components/financeiro/ImportadorItauPagamentos.tsx` linha **287**.

Apresentação/confirmação (mesmo arquivo `ConciliacaoDespesas.tsx`):
- A view CPR é lida na query e agregada num `Map` por `mov_id` (linhas ~138-158) e mesclada com a lista de "furos" (débitos sem match). A sugestão aparece inline em cada linha da tabela de furos, junto com sugestões de NF.
- Confirmação individual: função `confirmarUm(f)` (linha ~285) — botão inline por linha chama a RPC direto, sem dialog.
- Confirmação em lote: função `confirmarLote` (linha ~228) via seleção múltipla + botão. Iteração cliente-side, uma RPC por linha selecionada. Há `AlertDialog` (`setConfirmarLoteOpen`) só como confirmação genérica antes do loop, não por sugestão.
- Não há dialog de revisão dos valores nem entrada de valor manual — a confirmação é "aceita a sugestão do banco".

## 3. `src/pages/administrativo/ContasPagar.tsx` — query principal e noção de saldo

Query principal (linhas **108-121**): `.from("vw_contas_pagar_consolidado").select("*, plano_contas:plano_contas_id(codigo,nome), parceiros_comerciais:parceiro_id(razao_social), formas_pagamento:forma_pagamento_id(codigo,nome,cobra_email,pula_aprovacao), meios_pagamento:meio_pagamento_id(codigo), cartoes_credito:cartao_id(nome,ultimos_digitos)")` ordenado por `data_vencimento`.

Selects secundários sobre `contas_pagar_receber` (não expostos pela view):
- linha **129-131**: `id, email_pagamento_enviado`.
- linha **148-150**: `id, pagamento_com_pendencia, pendencias_no_envio`.
- linha **172-174**: `id, nf_aplicavel, vinculo_nf_completo, valor_nf_vinculado`.
- linha **218-221**: `id, pedido_compra_id` (para solicitante).

Noção de valor pago / saldo / restante na tela **Contas a Pagar**: **não existe** coluna dedicada de saldo por título. A tela só usa o `valor` do título. Nenhum select traz `valor_pago`, `valor_alocado` ou `saldo_a_pagar`.

O único "saldo" referenciado no arquivo é de **conta-corrente de fornecedor** (bloco separado no rodapé), lendo `vw_conta_corrente_fornecedor` / `vw_conta_corrente_extrato`:
- Tipo `CcFornecedor` com `saldo_devedor` — linha **767**.
- Renderização do saldo por fornecedor — linhas **782, 802, 804, 838-840, 862, 898-900, 919** (ordenação por `saldo_devedor`).

Isso é saldo agregado por CNPJ, não saldo por título.

## 4. Front que leia `pagamento_alocacao` ou "valor alocado"/"saldo do título"

- `pagamento_alocacao`: aparece **apenas em `src/integrations/supabase/types.ts`** (tipos auto-gerados, FKs). Nenhum consumo em código de aplicação.
- `valor_alocado`, `saldo_a_pagar`, `valor_restante`: **nenhuma ocorrência** em `src/`.
- Existe um leitor de `valor_nf_vinculado` (em `ContasPagar.tsx` linhas 172-183), mas é vínculo de NF, não alocação de pagamento.

## 5. `src/components/financeiro/ContaPagarDetalheDrawer.tsx` — histórico de pagamentos

Não há histórico de pagamentos (nem lista de alocações) no drawer. O que existe:

- Campo pontual `valor_pago` no tipo `Conta` — linha **63**. Renderizado como linha estática "Valor pago" quando `!= null && != valor` — linhas **512-513**.
- Campo `data_pagamento` renderizado como "Pago em" — linhas **509-510**.
- Campo `observacao_pagamento` — linhas **526-528**.
- Componente `TimelineHistorico` importado na linha **49** e renderizado na linha **856** com `contaId={conta.id}`.

O `TimelineHistorico` (`src/components/financeiro/TimelineHistorico.tsx`) usa o hook `useHistoricoConta` de `src/hooks/useContaWorkflow.ts` (linhas **74-88**), que lê **`contas_pagar_historico`** ordenado por `created_at desc`. É histórico de **transições de status** (`status_anterior → status_novo`, `observacao`, `usuario_id`, `created_at`) — **não** é histórico de pagamentos/alocações.

Nada no drawer lê `pagamento_alocacao` nem exibe distribuição de valor pago em múltiplos eventos.
