# Mercado Pago — Fase 2: atribuir recebíveis B2C "sem_pedido"

Destino final: `.lovable/plan-mp-fase2.md`. Neste modo só posso gravar aqui; no primeiro passo do build copio para `.lovable/plan-mp-fase2.md` e devolvo este arquivo ao conteúdo anterior (ou deixo, se você preferir).

## O que já foi verificado
- `shopify_pagamento_ref` é alimentada só por `shopify-pagamento-sync`, cron `shopify-pagamento-sync-diaria` (1x/dia, 06:00 BRT).
- A edge busca apenas os **últimos 50 pedidos** (`orders(first: n)`, máx. 100), sem paginação nem janela de data. Qualquer dia com mais de 50 pedidos entre duas execuções (ou execução que falhou) deixa buraco permanente — não há recuperação.
- O token gravado é o primeiro `paymentId/authorizationCode/accountNumber` de qualquer transação do pedido, sem filtrar `gateway` Mercado Pago, `kind` SALE/CAPTURE nem `status` SUCCESS.
- Hipótese (a confirmar no passo 2a): os 5 tokens de set–out caíram nesse buraco de 50, ou o pedido tem mais de uma transação (ex. falha + reenvio) e a gravada não é a que liquidou.

## Ordem de execução (cada passo testável)

### 1. Enriquecer liberações antigas com EXTERNAL_REFERENCE
- `mp-relatorios`: novo modo `enriquecer` (janelas ≤ 60 dias) que pede/baixa o release_report e, em vez de inserir, só faz `UPDATE movimentacoes_bancarias SET referencia_pedido` onde está nulo, casando pela chave de dedup já usada (`hash` / `id_transacao_banco` = SOURCE_ID). Nunca cria lançamento; linha sem par vai para contagem "sem_par", não para inserção.
- Regra de casamento em `_shared/financeiro/mp/release.ts` (função pura `enriquecerReferencias`) com teste.
- Não sobrescreve token existente; se divergir, conta como "conflito" e reporta.
- Registro em `extrato_importacoes`? Não — uma tabela de execução própria (`mp_relatorio_enriquecimento`) para não inflar o histórico de importações nem o pacote do contador. Original guardado no bucket `contabil` mesmo assim (consulta: ver pergunta 3).
- **Teste: junho/2026 (1 mês)**. Valida: colunas presentes no CSV (EXTERNAL_REFERENCE/SOURCE_ID), nº de lançamentos casados, ganharam token, sem par, conflitos, zero inserções (contagem total de `movimentacoes_bancarias` antes = depois). Só então jul → 15/09.

### 2. Completar `shopify_pagamento_ref` e corrigir a causa
- 2a. Diagnóstico só leitura: para os 6 tokens de set–out, consultar a Shopify (pedido por nome/data) e mostrar quantos pedidos houve nos dias, se o token aparece em outra transação, e qual o gateway. Reporto a causa real antes de mudar a edge.
- 2b. Correção da edge `shopify-pagamento-sync`:
  - paginação por cursor com filtro `updated_at:>=` (janela desde a última execução bem-sucedida − 2 dias de folga), em vez de "últimos 50";
  - guarda **todas** as transações de sucesso de gateway Mercado Pago (um pedido pode ter N tokens), upsert idempotente `(token, order_name)`;
  - modo `backfill?desde=2026-06-01` com retomada por cursor (lotes curtos, sem estourar tempo).
  - pode exigir migração: unicidade `(token, order_name)` e coluna `gateway`/`transacao_id` se ainda não existirem (confiro o schema antes).
- 2c. Alerta: falha da sync diária gera tarefa TI (padrão `tarefas_filas` já usado na Fase 1).
- **Teste:** backfill de junho; valida nº de refs novas e quantos dos 75 de junho passam a "atribuído" na `vw_recebivel_b2c_pedido`. Depois jul → hoje.

### 3. Fila de decisão manual (Financeiro)
- Migração: tabela `recebivel_b2c_decisao` (mov_id único, decisão `vinculado` | `nao_site`, `pedido_shopify` ou motivo ≥ 3 chars, autor, data) + dimensão de decisões em tabela; `vw_recebivel_b2c_pedido` passa a considerar o vínculo manual como 3ª regra (sem mudar as duas atuais).
- RPCs `fn_recebivel_b2c_vincular(mov, order_name)` (valida pedido existe e não está vinculado a outro recebível) e `fn_recebivel_b2c_nao_site(mov, motivo)`; permissão por slugs `acao.recebivel_b2c.vincular` / `.classificar`, registradas em `acao_superficie`.
- Fila `tarefas_filas` Financeiro "Recebível MP sem pedido" alimentada pela view (só o que restar após 1+2); card abre gaveta com dados do lançamento e candidatos **apenas como consulta** (sem sugestão automática por valor+data).
- O lançamento de R$ 2.511,61 (`bb1d92ee…`) entra aqui.

## Riscos
- Relatórios de liberação antigos podem não trazer EXTERNAL_REFERENCE preenchido (MP só preenche se a configuração tinha a coluna na geração — o relatório é regerado agora com a config atual, então deve vir; o teste de junho confirma).
- Formato do token muda (numérico de 16 dígitos vs. alfanumérico do checkout): casamento por texto exato, normalizado só por trim; reporto formatos encontrados.
- Pedidos Shopify antigos (antes de 21/07) podem ter transações arquivadas ou gateway diferente.
- Limite de taxa da Shopify/MP no backfill: lotes pequenos com retomada.
- Pedido vinculado manualmente que depois ganha token automático: a regra automática vence só se apontar para o mesmo pedido; divergência vira alerta, não sobrescrita.

## Perguntas
1. Posso gravar o plano em `.lovable/plan-mp-fase2.md` no início do build e restaurar `.lovable/plan.md`?
2. Na sync Shopify, guardar todos os tokens de sucesso do pedido (recomendo) ou só o da captura final?
3. Os CSVs regerados para enriquecimento devem ser guardados no bucket `contabil` (entram no pacote do contador) ou ficar fora, já que o original daquele período já existe?
4. "Classificar como não-site": basta motivo livre, ou quer uma lista de destinos (ex. venda direta, link avulso, outro) em tabela?
5. Quem pode decidir na fila: só Financeiro, ou também super admin?
