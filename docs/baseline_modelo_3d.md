# Baseline Modelo 3D — Schema Atual
**Versão 1.0 · 21/05/2026 · pós-Onda 0 · pré-Ondas 1/2/3**

Documento de referência arquitetural. Captura o estado do schema das tabelas, views, triggers e RPCs envolvidas no Modelo 3D de Pagamento (#130) após a aplicação da Onda 0 do plano Opção B (separação Conta/Meio/Forma).

**Status:** Modelo 3D parcialmente implementado. Schema (banco) está pronto; front e dados ainda precisam de migração (Ondas 1 e 2). CHECK constraint de `contas_bancarias.tipo` ainda aceita valores legados — fica pra Onda 3.

**Não substitui migrations.** Ver **B-34** no Roadmap para versionamento retroativo do schema atual em arquivos `supabase/migrations/`.

---

## 01 — Tabelas

### `cartoes_credito` (instância de meio · Modelo 3D)

Representa a entidade "cartão de crédito" como instância de meio de pagamento, separada da conta bancária real. Criada via SQL Editor durante a sessão 20/05.

| Coluna | Tipo | Nullable | Default |
|---|---|---|---|
| id | uuid | NOT NULL | gen_random_uuid() |
| nome | text | NOT NULL | — |
| bandeira | text | nullable | — |
| ultimos_digitos | text | nullable | — |
| conta_bancaria_id | uuid | nullable | — |
| limite | numeric | NOT NULL | 0 |
| ativo | boolean | NOT NULL | true |
| created_at | timestamptz | NOT NULL | now() |
| updated_at | timestamptz | NOT NULL | now() |

**FK:**
- `conta_bancaria_id` → `contas_bancarias.id` (ponte temporária #128 até refator da Onda 3 / B-19)

**Notas:**
- Coluna `conta_pagamento_id` DROPADA na Onda 0 (era espelhada com `conta_bancaria_id`)
- Canônico para a ponte: `conta_bancaria_id` (convenção §3.2 — FK usa nome da tabela target + `_id`)
- Sem triggers user-defined

### `faturas_cartao`

| Coluna | Tipo | Nullable | Default |
|---|---|---|---|
| id | uuid | NOT NULL | gen_random_uuid() |
| cartao_id | uuid | nullable | — |
| conta_bancaria_id | uuid | nullable | — |
| conta_pagar_id | uuid | nullable | — |
| data_emissao | date | nullable | — |
| data_vencimento | date | NOT NULL | — |
| periodo_inicio | date | nullable | — |
| periodo_fim | date | nullable | — |
| valor_total | numeric | NOT NULL | — |
| valor_total_calculado | numeric | nullable | — |
| valor_pagamento_anterior | numeric | nullable | — |
| valor_saldo_atraso | numeric | nullable | 0 |
| status | text | NOT NULL | 'aberta' |
| numero_documento | text | nullable | — |
| pdf_storage_path | text | nullable | — |
| pdf_nome_original | text | nullable | — |
| fonte_importacao | text | nullable | — |
| observacao | text | nullable | — |
| importacao_lote_id | uuid | nullable | — |
| criado_por | uuid | nullable | — |
| created_at | timestamptz | NOT NULL | now() |
| updated_at | timestamptz | NOT NULL | now() |

**FKs:**
- `cartao_id` → `cartoes_credito.id` (Modelo 3D — ponto correto)
- `conta_bancaria_id` → `contas_bancarias.id` (caminho legado — ver dívida abaixo)
- `conta_pagar_id` → `contas_pagar_receber.id`

**CHECK:** `status IN ('aberta', 'paga', 'conciliada', 'cancelada')`

**Dívida conhecida:** Em 21/05, `cartao_id` está NULL nas 3 faturas vivas e `conta_bancaria_id` aponta pra entrada legada em `contas_bancarias` (`tipo='cartao_credito'`). Onda 1 vai popular `cartao_id`. Onda 2 migra o `ImportarFaturaCartaoDialog` para gravar `cartao_id` em vez de `conta_bancaria_id`.

### `fatura_cartao_lancamentos`

| Coluna | Tipo | Nullable | Default |
|---|---|---|---|
| id | uuid | NOT NULL | gen_random_uuid() |
| fatura_id | uuid | NOT NULL | — |
| conta_pagar_id | uuid | nullable | — |
| compromisso_parcelado_id | uuid | nullable | — |
| nf_vinculada_id | uuid | nullable | — |
| parceiro_id | uuid | nullable | — |
| plano_contas_id | uuid | nullable | — |
| centro_custo_id | uuid | nullable | — |
| descricao | text | NOT NULL | — |
| descricao_normalizada | text | nullable | — |
| estabelecimento_descricao | text | nullable | — |
| estabelecimento_local | text | nullable | — |
| ramo_estabelecimento | text | nullable | — |
| cnpj_estabelecimento | text | nullable | — |
| data_compra | date | NOT NULL | — |
| valor | numeric | NOT NULL | — |
| valor_original | numeric | nullable | — |
| moeda | text | nullable | — |
| cotacao | numeric | nullable | — |
| natureza | text | NOT NULL | 'NACIONAL' |
| parcela_atual | integer | nullable | — |
| parcela_total | integer | nullable | — |
| num_autorizacao | text | nullable | — |
| linha_original_csv | text | nullable | — |
| tipo | text | NOT NULL | 'compra' |
| status | text | NOT NULL | 'pendente' |
| created_at | timestamptz | NOT NULL | now() |
| updated_at | timestamptz | NOT NULL | now() |

**FKs:**
- `fatura_id` → `faturas_cartao.id`
- `conta_pagar_id` → `contas_pagar_receber.id`
- `nf_vinculada_id` → `contas_pagar_receber.id`
- `parceiro_id` → `parceiros_comerciais.id`
- `plano_contas_id` → `plano_contas.id`
- `centro_custo_id` → `centros_custo.id`

### `contas_pagar_receber` — colunas adicionadas pelo Modelo 3D

| Coluna | Tipo | Nullable | FK |
|---|---|---|---|
| cartao_id | uuid | nullable | → `cartoes_credito.id` |
| meio_pagamento_id | uuid | NOT NULL | → `meios_pagamento.id` |
| pago_em_conta_id | uuid | nullable | → `contas_bancarias.id` (validado por trigger) |
| enviado_pagamento_em | timestamptz | nullable | — |

**Notas:**
- `meio_pagamento_id` é obrigatório (NOT NULL). Default é setado pela trigger `fn_cpr_set_meio_default` em INSERT/UPDATE.
- `pago_em_conta_id` é validado pela trigger `fn_validar_pago_em_conta_real` — só aceita conta real (não cartão).
- `cartao_id` aponta pra instância em `cartoes_credito` quando `meio_pagamento_id` é `fatura_cartao`.

---

## 02 — CHECK constraints relevantes

### `contas_bancarias.tipo` — DÍVIDA ATIVA (Onda 3)

```sql
CHECK (tipo IN ('corrente', 'poupanca', 'cartao_credito', 'cartao_debito', 'caixa_fisico', 'investimento'))
```

Pelo Modelo 3D, `cartao_credito` e `cartao_debito` não deveriam mais ser valores válidos — cartão é entidade separada em `cartoes_credito`. **Onda 3** vai dropar esses valores do CHECK depois que o front parar de criar entradas com esses tipos (Onda 2).

### `faturas_cartao.status`
```sql
CHECK (status IN ('aberta', 'paga', 'conciliada', 'cancelada'))
```

### `movimentacoes_bancarias.tipo`
```sql
CHECK (tipo IN ('credito', 'debito'))
```

### `movimentacoes_bancarias.origem`
```sql
CHECK (origem IN ('ofx', 'csv_itau', 'csv_safra', 'manual', 'cpr', 'conta_pagar'))
```

---

## 03 — Views

### `vw_contas_pagar_consolidado`

Consolida `contas_pagar_receber` com NF do stage, movimentação bancária e flags computadas. Filtra `cp.tipo = 'pagar'`.

**Expõe campos do Modelo 3D:** `meio_pagamento_id`, `meio_codigo`, `eh_cartao` (computado: `mp.codigo = 'fatura_cartao'`), `cartao_id`, `pago_em_conta_id`, `enviado_pagamento_em`.

**Flags computadas:**
- `status_efetivo`: derivado de `status` + `mb.conciliado` (`pago_conciliado` / `em_movimentacao` / status base)
- `tem_doc_pendente`: tag `doc_pendente` presente em `cp.tags`
- `atrasada`: vencimento < hoje E status pré-pagamento

Definição completa via `pg_get_viewdef('public.vw_contas_pagar_consolidado'::regclass, true)`.

### `vw_faturas_cartao_resumo`

Agrega `faturas_cartao` com contagens e somas dos `fatura_cartao_lancamentos` filhos por status (`conciliado`, `pendente`, `ignorado`, `virou_despesa`).

Campos agregados: `qtd_lancamentos`, `valor_conciliado`, `qtd_conciliados`, `valor_pendente`, `qtd_pendentes`, `valor_ignorado`, `qtd_ignorados`.

---

## 04 — Triggers protetoras (NÃO mexer sem revisão da #130)

### `fn_validar_pago_em_conta_real` — em `contas_pagar_receber`
BEFORE INSERT UPDATE (trigger `trg_validar_pago_em_conta_real_cpr`). Valida que `pago_em_conta_id` aponta pra `contas_bancarias` com tipo entre `corrente`, `poupanca`, `investimento`, `caixa_fisico`. Bloqueia tipo `cartao_credito` / `cartao_debito`.

### `fn_validar_conta_real_mov` — em `movimentacoes_bancarias`
BEFORE INSERT UPDATE. Mesma garantia em movimentações.

### `fn_proteger_mov_duplicada` — em `movimentacoes_bancarias`
BEFORE INSERT UPDATE. Impede movimentação duplicada (hash/FITID).

---

## 05 — Triggers de comportamento

### Em `contas_pagar_receber`

| Trigger | Quando | Função | O que faz |
|---|---|---|---|
| trg_cpr_updated_at | BEFORE UPDATE | set_updated_at | timestamp |
| trg_cpr_set_meio_default | BEFORE INSERT UPDATE | fn_cpr_set_meio_default | default de meio_pagamento_id |
| trg_cpr_enviada_para_pagamento | BEFORE UPDATE | fn_cpr_enviada_para_pagamento | seta `enviado_pagamento_em` quando status muda pra `enviado_para_pagamento` |
| trg_auto_criar_compromisso_parcelado | BEFORE INSERT | fn_auto_criar_compromisso_parcelado | gera compromisso quando parcelado |
| trg_popular_data_compra | BEFORE INSERT | fn_popular_data_compra_de_compromisso | herda data |
| trg_sincronizar_tags_documentos | BEFORE INSERT UPDATE | sincronizar_tags_documentos | tags ↔ docs |
| trg_validar_categoria_folha_cpr | BEFORE INSERT UPDATE | fn_validar_categoria_folha_cpr | só folha (#07.6) |
| recalc_docs_status_conta | BEFORE UPDATE | trg_recalc_docs_status_conta | recalcula doc_pendente |
| trg_historico_origem_criacao | AFTER INSERT | fn_registrar_historico_origem_conta | histórico de origem |
| trg_ia_sugerir_categoria | AFTER INSERT | fn_ia_sugerir_categoria_no_insert | IA sugere categoria |
| trg_cpr_recalc_nf | AFTER INSERT UPDATE | fn_trg_cpr_recalc_nf | recalcula vínculos NF |
| trg_gerar_mov_ao_pagar | AFTER UPDATE | fn_gerar_mov_ao_pagar | gera movimentação quando vira `paga` |
| trg_cpr_tarefa_pendencia | AFTER UPDATE | fn_cpr_tarefa_pendencia | tarefa pra pendências |
| trg_cpr_timeline_pedido | AFTER UPDATE | fn_cpr_timeline_pedido | timeline do pedido |
| trg_detectar_inconsistencia_categoria | AFTER UPDATE | fn_detectar_inconsistencia_categoria | alerta inconsistência |
| trg_propagar_dimensoes_cpr | AFTER UPDATE | fn_propagar_dimensoes_cpr | propaga dimensões pras irmãs |
| trg_propagar_cat_conta_cartao | AFTER UPDATE | fn_propagar_categoria_conta_para_cartao | CPR → lançamento de cartão |

### Em `fatura_cartao_lancamentos`

| Trigger | Quando | Função | O que faz |
|---|---|---|---|
| trg_set_updated_at_lancamentos_cartao | BEFORE UPDATE | set_updated_at_faturas_cartao | timestamp |
| trg_propagar_cat_cartao_conta | AFTER UPDATE | fn_propagar_categoria_cartao_para_conta | lançamento → CPR vinculada |
| trg_status_fatura_cartao | AFTER INSERT DELETE UPDATE | fn_atualizar_status_fatura_cartao | recalcula status da fatura quando lançamentos mudam |

**Nota sobre propagação bidirecional:** as triggers `trg_propagar_cat_conta_cartao` (CPR → lançamento) e `trg_propagar_cat_cartao_conta` (lançamento → CPR) formam loop conceitual. Em prática as funções devem ter guard (só atualiza onde categoria é NULL). Não auditado em detalhe nessa sessão — anota como item de revisão futura.

### Em `movimentacoes_bancarias`

| Trigger | Quando | Função | O que faz |
|---|---|---|---|
| trg_proteger_mov_duplicada | BEFORE INSERT UPDATE | fn_proteger_mov_duplicada | **PROTETORA** anti-duplicação |
| trg_validar_conta_real_mov | BEFORE INSERT UPDATE | fn_validar_conta_real_mov | **PROTETORA #130** |
| trg_sync_status_cpr_apos_movimentacao | AFTER INSERT UPDATE | fn_sync_status_cpr_apos_movimentacao | sincroniza status CPR |
| trg_refletir_movimentacao_em_conta_pagar | AFTER UPDATE | refletir_movimentacao_em_conta_pagar | reflete na CPR vinculada |

### Em `faturas_cartao`

| Trigger | Quando | Função | O que faz |
|---|---|---|---|
| trg_set_updated_at_faturas_cartao | BEFORE UPDATE | set_updated_at_faturas_cartao | timestamp |

### Em `cartoes_credito`
Sem triggers user-defined.

---

## 06 — RPCs públicas do Modelo 3D

### `conciliar_lancamento(p_lancamento_id uuid, p_conta_pagar_id uuid) → jsonb`

Vincula um lançamento de fatura (`fatura_cartao_lancamentos`) a uma CPR (`contas_pagar_receber`).

Fluxo:
1. Sobrepõe valor da CPR pelo valor do lançamento (fatura é a verdade do banco)
2. Se a CPR já tem movimentação vinculada, atualiza valor lá também
3. Marca o lançamento como `conciliado` e popula `conta_pagar_id`

Retorna jsonb: `{ok, lancamento_id, conta_pagar_id, conta_descricao, valor_antigo, valor_novo, valor_alterado, movimentacao_atualizada}` ou `{ok: false, erro: ...}`.

### `aprovar_cpr_em_cascata(p_cpr_id uuid, p_status_alvo text DEFAULT 'aprovado') → jsonb`

Aprova CPR e propaga em cascata para parcelas irmãs e documentos vinculados.

Pendência conhecida: **R-03** — não preenche `enviado_pagamento_em` quando `p_status_alvo = 'enviado_para_pagamento'` no fluxo cartão.

---

## 07 — Triggers/Funções DROPADAS na Onda 0

### `sync_banco_fatura_para_conta` (REMOVIDA — código zumbi do modelo antigo)

Era AFTER INSERT UPDATE em `fatura_cartao_lancamentos`. Quando um lançamento ganhava `conta_pagar_id`, tentava auto-preencher `pago_em_conta_id` da CPR usando `faturas_cartao.conta_bancaria_id` (e propagava pras irmãs do mesmo `parcela_grupo_id`).

**Por que foi dropada:**
- Violava doutrina #127: `pago_em_conta_id` é campo da **Tela 3** (Movimentações), não deve ser preenchido em fluxo de Tela 2 (vinculação)
- Quando `faturas_cartao.conta_bancaria_id` apontava pra entrada legada (`contas_bancarias.tipo='cartao_credito'`), disparava `fn_validar_pago_em_conta_real` que bloqueava — produzia o erro `[object Object]` no front
- Era resquício do modelo antigo (pré-#130) onde "conta da fatura" e "pago em conta" eram a mesma entidade (o cartão)

LIMP-1 + INPUT-1 aplicadas.

### Coluna `cartoes_credito.conta_pagamento_id` (REMOVIDA)

Espelhada com `conta_bancaria_id` em 100% dos registros (Query diagnóstico confirmou: divergentes=0). Canônico passa a ser `conta_bancaria_id` (convenção §3.2 — FK usa nome da tabela target + `_id`).

---

*Documento mantido em `/docs/baseline_modelo_3d.md`. Atualizar quando schema do Modelo 3D mudar (especialmente após Ondas 1, 2, 3).*

*Versionamento retroativo em migrations: ver B-34.*
