# PORTAO-CARIMBA-EXTRATO — 26/11/2026

## Regra
Quando um adiantamento ganha o vínculo com uma linha bancária, essa linha deve ser identificada no mesmo passo como recebimento do pedido. Outra classe, outro pedido, duplicata ou outro vínculo financeiro nunca pode ser sobrescrito. A data confirmada não pode anteceder o pedido nem ser futura.

## Origem encontrada
- `confirmar_comprovante_pagamento` chama `confirmar_pagamento_linha`; esta cria o adiantamento **sem** `movimentacao_origem_id`. A confirmação humana, por si só, não faz o casamento bancário.
- `fn_conciliar_recebimentos(false)` (cron horário no minuto 17) preenche esse vínculo e **não atualizava nenhum campo da movimentação**. É um caminho confirmado para o estado relatado.
- `fn_conciliar_comprovante_chave` e `fn_conciliar_comprovante_documento` preenchiam o vínculo e apenas `conciliado`/`conciliado_em`, sem classe, autoria da classe ou referência do pedido.
- `fn_conciliar_recebimento_agrupado` usava uma classe diferente (`adiantamento_cliente`) e não completava data/referência.
- `fn_portao_conciliar_automatico` já tinha os cinco campos corretos e foi a referência.
- Não foi encontrada evidência de alteração dessas funções em 13/11. O comentário de VINCULO-ANTES-DA-DESCIDA na função automática é de 09/11; o de casamento por documento é de 10/11. A mudança de 13/11 encontrada no histórico é PIX-SAFRA-LINK, não a escrita do vínculo do comprovante. Não atribuir a regressão a esse dia sem uma definição histórica adicional.

## Proteção aplicada
- Migração `0112_portao_carimba_extrato_e_valida_datas`: gatilho `AFTER INSERT OR UPDATE OF movimentacao_origem_id` no adiantamento, com bloqueio da linha bancária durante a decisão e carimbo idempotente.
- Os quatro carimbos parciais/redundantes citados acima foram removidos das definições existentes por substituição validada; o gatilho é a única escrita dos cinco campos nesse conjunto de caminhos. O casamento de `fn_conciliar_recebimentos` continua intacto e passa a ser protegido pelo gatilho.
- Conflito: movimentação integralmente preservada, evento `portao_carimba_extrato_conflito` no pedido, prova `divergente` e aviso do banco. Não é lançada exceção nesse caso: ela reverteria também o evento e o fato do pagamento. Não há promessa de carimbo em conflito nem sucesso de conciliação da prova.
- Datas: gatilhos de escrita no comprovante confirmado com pedido e no plano pago. Comparação de dias em UTC, correspondente à conversão da data simples recebida pelas funções; aceita pagamento na própria data do pedido. Não restringe datas de repasse/vencimento nem comprovantes de contas a pagar ou sem pedido.
- Não houve atualização histórica, publicação de telas/funções, alteração de permissões existentes ou alteração de agendamentos.

## Lugares conferidos por leitura de código
| Lugar | Resultado |
|---|---|
| Casa dos Pedidos: `FilaPedidosPorArea` | Usa `ConfirmarPagamentoDialog`, agora protegido no banco. |
| Pedido: `PedidoDetalhe` e `PortaoLinksPanel` | Mesmo diálogo compartilhado; não escrevem o carimbo por conta própria. |
| Site SP: `VendaDiretaGestao` e `VendaDiretaNovo` | Mesmo diálogo; sem validação de intervalo própria. Proteção agora no banco. |
| Comercial: `PedidoOportunidadeDialog` | Mesmo diálogo em modo Mesa. |
| Comercial: `ComprovantePagamentoBloco` | Usa `useConfirmarComprovante`, recebe e mostra a mensagem real de erro; antes só exigia data preenchida. |
| Crédito: `PrimeiroPagamentoTab` | Mesmo diálogo. |
| Conciliação: `EntradasReconhecerTab` | Mesmo diálogo em modo Mesa. |
| Conciliação: `RegistrarRecebimentoDialog` | Usa a confirmação de comprovante de cliente; comprovante sem pedido mantém regra anterior, e comprovante com pedido recebe a guarda do banco. |
| `AcoesVendaDireta` | Importa o hook antigo, mas não tem chamada ativa de confirmação por esse hook; não cria um caminho paralelo de vínculo bancário. |
| `ConfirmarPagamentoDialog` | Recebe a data da IA e permite edição; chama comprovante, linha ou captura, todos delegando às escritas protegidas; mantém aberto em erro. |
| `useConfirmarComprovante` / `useConfirmarPagamentoLinha` | Enviam data original; erros do banco são propagados e apresentados. Sem alterações no front. |
| `confirmar_comprovante_pagamento` / `confirmar_pagamento_linha` | Definições lidas; lógica, permissões e assinaturas intactas. Datas agora guardadas nas tabelas de destino. |
| `fn_confirmar_captura_cartao` / `confirmar_cartao_capturado` | Definições lidas; delegam a confirmação a `confirmar_pagamento_linha`, herdando a guarda de data. |
| `safrapay-link-sync` (PIX direto e link PIX) | Código lido; chama `confirmar_pagamento_linha`, registra erro real se confirmação falhar. Sem deploy. |
| `fn_conciliar_recebimentos` — cron :17 | Código lido; faltava carimbo. Resolvido pela proteção no adiantamento, sem mudar a seleção de candidatos. |
| `fn_conciliar_comprovante_chave` — cron :37 | Código lido e caminho real executado em transação revertida; carimbo completo. |
| `fn_conciliar_comprovante_documento` — cron :38 | Código lido; carimbo parcial removido e proteção única herdada. |
| `fn_conciliar_recebimento_agrupado` | Código lido; carimbo divergente removido e proteção única herdada. |
| `fn_portao_conciliar_automatico` — cron :15 | Código lido; carimbo redundante removido, demais regras mantidas. |
| `vw_extrato_fila` / `vw_conciliacao_orfaos` | Colunas/definição lidas e saída da linha de teste confirmada no banco. Views intactas. |
| Deduplicação/pares de transferência | Função lida; já exclui vínculos em adiantamentos. Sem alterações na regra ou em seu backfill. |

## Verificações executadas
- Teste SQL com `ROLLBACK`: confirmação pelo comprovante, cinco campos do carimbo, saída de ambas as filas, INSERT e UPDATE de vínculo, vínculo nulo e idempotência.
- Conflitos testados com outra classe conciliada e outro pedido: movimento inteiro inalterado, evento persistente dentro da transação e prova divergente.
- Datas de 23/10/2024 e amanhã recusadas no comprovante e na escrita direta do plano; pagamento em 23/10/2026 na própria data do pedido aceito.
- Caminho real `confirmar_comprovante_pagamento` → `fn_conciliar_comprovante_chave(false)` → gatilho executado e revertido: vínculo criado, carimbo completo, ambas as filas sem a linha.
- Após reversão: zero pedidos, comprovantes, contas, clientes ou eventos de conflito de teste restantes.
- Os onze casos previamente corrigidos pelo Flávio foram somente consultados e seguem com carimbo correto; PED-2375 segue pago em 23/10/2026.
- Compilação automática sem erros. Não foi confirmado pagamento real de cliente nem exercitada gravação pela interface.