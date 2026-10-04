# Repor "Excluir pedido" no detalhe do pedido de importação

Restauração do que existia no commit 7c5824ec. Sem view, função, RPC, tabela ou migração: a exclusão usa a RPC `excluir_pedido_importacao` que já existe (chamada primeiro com `p_confirmar: false` para a prévia, depois `true`).

## O que o usuário verá
- Na página do pedido (`/vendas/produto/chegada-mercadoria/{id}`), no cabeçalho ao lado de "Editar pedido", um ícone discreto de lixeira em vermelho (sem destaque).
- Clicar abre a confirmação idêntica à antiga: "Nada foi apagado ainda...", prévia (quantas linhas serão apagadas ou lista de bloqueios), botões "Cancelar" e "Excluir mesmo assim".
- Sem a permissão, o botão pede acesso (mesmo comportamento de antes).
- Após excluir: mensagem de sucesso, volta para `/vendas/produto/chegada-mercadoria?aba=painel` e a lista do Painel é atualizada.

## Detalhes técnicos
Único arquivo alterado: `src/pages/acervo/ChegadaMercadoriaDetalhe.tsx`
- Copiar literalmente do 7c5824ec: `PreviaExclusao`, estados (excluir aberto, prévia, checando, excluindo), `abrirExclusao`, `confirmarExclusao`, permissão `usePermissaoAcaoOuSuperAdmin("acao.excluir_pedido_importacao")`, `BotaoGuardado` (slug `acao.excluir_pedido_importacao`) e o `<Dialog>` com as mesmas mensagens. Adaptação mínima: o alvo é o pedido da página (`pedidoId`), não uma linha de lista.
- Após sucesso: `invalidarCompras(qc)` + invalidar `["importacao-pedidos-painel"]`, `["importacao-embarques"]` e `CHAVE_EMBARQUE_PAINEL`, depois `navigate("/vendas/produto/chegada-mercadoria?aba=painel")`.
- Não mexer no Painel nem em outras abas. Typecheck no fim; não publicar.
