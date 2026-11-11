# Diagnóstico TIK-0001 — NF emitida no Bling, pedido parado em "Aguardando NF"

O banco não respondeu nesta sessão (conexão indisponível, 3 tentativas); itens 2–4 dependem dele e seguem **não confirmados**. O item 1 foi confirmado no código.

## 1. Mecanismo (confirmado no código)
- Não existe rotina dedicada a NF de marketplace. `bling-marketplace-sync` (acao `pedidos`) só **cria** o pedido (`fn_nascer_pedido_marketplace`) e grava `bling_pedido_fila_mkt.bling_pedido_id`; a acao `rastreio` só olha `em_transporte`.
- `vd-nf-sync` atende só `origem = 'venda_direta'`.
- O que sobra é a varredura geral `sync-bling-financeiro/sync-nfe.ts` → `_shared/bling/nfe-item.ts` (`sincronizarNfePorId`), que grava em `nfs_emitidas`. Os gatilhos de `nfs_emitidas` movem o estágio. Casamento NF ↔ pedido, em ordem:
  1. `numeroPedidoLoja` → `fn_resolver_pedido_por_ref_bling` (espera `id_externo` / código de remessa do SNCF);
  2. `pedidoVenda.numero` → mesma RPC;
  3. `pedidoVenda.id` → `pedido_remessa.bling_pedido_id`;
  4. `pedidoVenda.id` → `pedidos.bling_id_destino`.

## Causa provável (a confirmar)
Na NF do marketplace, `numeroPedidoLoja` traz o número do TikTok, e `pedidoVenda.numero` é 1080, nenhum deles igual a "TIK-0001". O `pedidoVenda.id` está em `bling_pedido_fila_mkt`, mas nenhuma das quatro chaves acima lê essa fila. Se `fn_nascer_pedido_marketplace` não preenche `pedidos.bling_id_destino`, a NF entra em `nfs_emitidas` sem `pedido_venda_id` (órfã), ou nem entra, se a varredura ainda não passou por ela.

## Passos de verificação (só leitura, quando o banco voltar)
1. `vw_gestao_marketplace` / `pedidos` do TIK-0001: estágio, `nf_numero`, `faturado_em`, `bling_id_destino`, nº do marketplace.
2. `bling_pedido_fila_mkt` do Bling 1080: `bling_pedido_id`, `numero_loja`, status.
3. `nfs_emitidas` por `bling_pedido_venda_id` = esse id, ou `bling_pedido_venda_numero` = '1080': número, série, chave, emissão, `pedido_venda_id`, `numero_pedido_loja`.
4. Última execução da varredura de NF (log/cron do `sync-bling-financeiro`) e logs da edge.
5. Definição de `fn_nascer_pedido_marketplace` e `fn_resolver_pedido_por_ref_bling`, para ver se gravam ou leem `bling_id_destino` / o nº do marketplace.

## Correção mínima proposta (não executar sem OK)
- **(a) Destravar o TIK-0001:** se a NF já está órfã em `nfs_emitidas`, vincular `pedido_venda_id` ao TIK-0001 (via migração/RPC de vínculo existente), para os gatilhos levarem o pedido à XPM. Se a NF não está no banco, rodar `nfe-reconferir` para essa NF depois do ajuste (b).
- **(b) Corrigir o mecanismo:** em `nfe-item.ts`, incluir um fallback 5: `pedidoVenda.id` → `bling_pedido_fila_mkt.bling_pedido_id` → `pedido_id`. A alternativa é fazer `fn_nascer_pedido_marketplace` gravar `pedidos.bling_id_destino`, aproveitando o fallback 4 que já existe, o que dispensa mudança na edge. Se a varredura não percorrer NFs recentes a tempo, criar uma versão "dirigida" do tipo `vd-nf-sync` para marketplace `aguardando_nf`.
