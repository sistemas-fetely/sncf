# F5 passo 1 — Varredura de divergência SNCF × Bling (só leitura)

## Objetivo
Medir campo a campo onde o cadastro do SNCF difere do card canônico no Bling, gravando o resultado nas tabelas que já existem. Nenhuma escrita no Bling.

## O que será construído

1. **Módulo compartilhado** `supabase/functions/_shared/bling/montar-valores-produto.ts`
   - Extrai da `corrigir-produto-bling` a montagem dos valores do SNCF já convertidos e a leitura do valor do card: nome = nome_operacional, preço, gtin/ean, peso g para kg (pesoLiquido e pesoBruto), dimensões em cm, gtinEmbalagem/dun, itensPorCaixa do inner do cartório (só >= 1), NCM/CEST só dígitos, situação A/I pela fase.
   - Mesmas tolerâncias e normalização (`txt`, `num`, `vazio`, `TOL`).
   - A `corrigir-produto-bling` passa a importar esse módulo, com comportamento idêntico (mesmo de_para, mesma ordem, mesma regra de unidadeMedida, PUT intocado).

2. **Edge nova** `supabase/functions/varrer-divergencia-bling/index.ts`
   - Autenticação: só `x-cron-secret` igual a `get_vault_secret('SYNC_CRON_SECRET')`; sem ou errado → 401.
   - Body: `{ limite?, skus?, lote_id?, cursor? }`.
   - Primeira chamada cria a linha em `produto_destino_varredura` (sistema 'Bling', modo 'detectar').
   - Universo: produtos com `vw_produto_conciliacao.bling_card_canonico` não nulo, ordenados por SKU; filtrados por `skus` e cortados por `limite`.
   - Campos comparados: lidos de `produto_campo_destino` (sistema 'Bling'), não fixos no código. Cada campo do de-para aponta para um extrator do módulo compartilhado. Campos sem extrator entram como erro nomeado no `detalhe_erros` do lote, uma vez só.
   - Para cada produto: GET `/produtos/{card canônico}` com o cliente Bling compartilhado (token, refresh, backoff em 429), pausa de ~350 ms entre chamadas (~3 por segundo). Para cada campo diferente depois de normalizar, grava uma linha em `produto_destino_divergencia`. SNCF vazio também é comparado (vazio vira null) para medir a diferença real.
   - Erro por produto: conta em `erros`, guarda `{sku, mensagem real}` em `detalhe_erros` e segue.
   - Paginação: cada execução processa uma página (~150 produtos, dentro do tempo limite). Se sobrar, acumula os totais no lote e se chama de novo (fire-and-forget com o mesmo segredo, `lote_id` e `cursor` = último SKU). Na última página grava `concluido_em` e devolve o resumo.
   - Falha ao gravar no banco aborta com o erro real (fail-loud).

## Teste
Deploy só das duas funções afetadas. Rodar com `{ "limite": 20 }` e o segredo. Mostrar o resumo do lote: produtos lidos, com divergência, divergências por campo e erros. Conferir as linhas em `produto_destino_divergencia`. Nenhum PUT/POST no Bling (só GET).

## Arquivos
- Novo: `supabase/functions/_shared/bling/montar-valores-produto.ts`
- Novo: `supabase/functions/varrer-divergencia-bling/index.ts`
- Alterado (só extração): `supabase/functions/corrigir-produto-bling/index.ts`

## Pontos de atenção
- `corrigir-produto-bling` hoje não trata `origem_fisc` nem `sku → codigo`. A varredura passa a comparar esses dois (origem fiscal: SNCF × `tributacao.origem`; código: SKU × `codigo`, com trim e maiúsculas). Na correção nada muda; `tributacao.origem` continua nunca tocada.
- A correção pega o card em `bling_produtos_cache`; a varredura usa o card canônico, como pedido.
- Nada no banco além das linhas de resultado da varredura. Sem migração. App não publicado.
