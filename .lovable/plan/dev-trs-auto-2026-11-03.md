# DEV-TRS-AUTO — TRS de retorno nasce sozinha na devolução (aprovado 03/11/2026)
- Regra única `fn_devolucao_exige_transferencia_cd(destino, canal)` usada por `vw_devolucao_funil`.
- `fn_devolucao_criar_trs_retorno` (FOR UPDATE, idempotente): itens = saldo líquido de `movimentacao_estoque` da devolução no destino, por SKU; cria TRS XPM-SC → destino com finalidade `retorno_devolucao` e natureza `transferencia_retorno_devolucao` (sem estoque, sem expedição); vincula; erro em `devolucao_trs_auto`.
- Gatilho no fim de `fn_devolucao_nf_registrar` (autorizada), bloco protegido.
- `devolucao-nf-verifica` (15 min): cria TRS faltante e envia ao Bling (enviar-pedido-bling modo sistema) só quando `bling_natureza_id` estiver preenchido.
- Trigger em `nfs_emitidas`: NF da TRS autorizada → `fn_devolucao_avaliar_encerramento`.
- Tela de devoluções: linha da Eva por `vw_devolucao_trs_retorno`; "Tentar de novo" (`acao.devolucao.trs_retorno.tentar`); fila `devolucao_trs_retorno` em `tarefas_filas`.
- Retroativo: DEV-B2C-1319/1341/1401.
