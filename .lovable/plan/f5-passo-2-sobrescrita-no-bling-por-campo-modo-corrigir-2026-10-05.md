# F5 passo 2 — Sobrescrita no Bling por campo (modo "corrigir")

## Objetivo
A varredura ganha um segundo modo que corrige no card canônico do Bling só os campos ligados em `produto_campo_destino.sobrescreve` (hoje: dun, fase, preco_varejo). O modo padrão continua "detectar", sem mudança.

## O que muda (só `supabase/functions/varrer-divergencia-bling/index.ts`)

1. **Body:** aceita `modo: "detectar" | "corrigir"` (padrão "detectar"), `dry_run: true`, além de `skus`, `limite`, `lote_id`, `cursor`. Modo e dry_run seguem no re-encadeamento.
2. **Interruptor lido do banco:** a leitura de `produto_campo_destino` passa a trazer `sobrescreve`. No modo corrigir, só campos com `sobrescreve = true` (e com extrator) são alterados. Nenhuma lista fixa no código.
3. **Mesmo universo, mesmo card canônico, mesma comparação** (inclusive a regra 0 = vazio nos opcionais).
4. **Freio de formato:** antes de cada página, lê `vw_produto_formato_alerta` para os cod_cadastro da página. Campo ligado com violação é pulado, com motivo `"<sku> <campo>: formato inválido — <motivo>"`.
5. **Correção por produto:**
   - Usa o card que acabou de vir do GET (o mesmo da comparação). Copia o objeto inteiro e troca só os campos ligados e divergentes:
     - dun → `gtinEmbalagem`
     - fase → `situacao` (A/I pela fase)
     - preco_varejo → `preco`
   - Envia o card completo com PUT `/produtos/{card canônico}`. Nunca monta o card do zero.
   - O PUT fica num helper local, com o token do cliente compartilhado: renova o token uma vez se vier 401, e no 429/5xx espera 1s, 2s e 4s. A pausa de ~350 ms entre chamadas continua.
   - SNCF vazio num campo ligado → não sobrescreve (pula com motivo "SNCF vazio"). Assim nunca apaga dado do Bling.
   - Erro do Bling → entra em erros com o SKU e a mensagem real, e o lote segue.
6. **Dry run:** faz tudo menos o PUT e devolve na resposta a lista `planejado` (sku, campo, de → para) e os pulados. Nada é gravado no Bling.
7. **Registro (sem coluna nova):**
   - `produto_destino_varredura`: `modo = 'corrigir'`. `divergencias` passa a contar os campos corrigidos (ou planejados, no dry run) e `erros` conta as falhas.
   - `detalhe_erros` passa a ser `{ dry_run, corrigidos, pulados: [{sku, campo, motivo}], erros: [{sku, mensagem}] }`. Os totais acumulam entre páginas.
   - `produto_destino_divergencia`: uma linha por campo sobrescrito com sucesso, no mesmo formato (valor_sncf = novo, valor_destino = valor antigo do Bling). No dry run não grava linha.
   - Falha ao gravar no banco aborta o lote com o erro real.
8. **Paginação:** igual à do modo detectar. No modo corrigir, a página cai para ~60 produtos, porque cada produto pode gastar GET + PUT dentro do tempo limite.

## Não muda
`corrigir-produto-bling`, módulo compartilhado, cron (nenhum agendamento), banco (o interruptor fica com você), app não publicado.

## Teste
- (a) `modo:"corrigir", dry_run:true, limite:20` → mostro as mudanças planejadas e os pulados.
- (b) `modo:"corrigir", skus:["CL-EH-PLT-23-HAL"]` real → card fica situação A e com o DUN.
- Em seguida, `modo:"detectar"` só nesse SKU → dun e fase somem. inner_qtd e origem_fisc continuam aparecendo, se divergirem.
- Disparo com o segredo por uma função temporária, como no passo 1; apago depois.
- Pré-requisito: `sobrescreve = true` só em dun, fase e preco_varejo. Confiro por leitura antes do teste real.

## Arquivos
- Alterado: `supabase/functions/varrer-divergencia-bling/index.ts`
