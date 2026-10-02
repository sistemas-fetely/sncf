# Remover Conferência e ampliar sinais da régua

## Escopo

- Remover da tela de detalhe do pedido a sub-aba **Conferência**, incluindo os blocos “Pedido × NF”, “Pedido × Invoice” e seus avisos e ações internas.
- Excluir somente consultas, tipos, cálculos, mutation e imports que ficarem exclusivos dessa sub-aba.
- Preservar `nfIds`, pois a conferência de usos mostrou que ele também alimenta o status de recebimento das NFs na sub-aba **Documentos**.
- Manter intacta a aba **Rateio de NF** e não criar alterações no banco.

## Navegação

- Restringir as sub-abas válidas a `linhas`, `documentos`, `saldo` e `historico`.
- Ao receber `?sub=conferencia`, abrir **Linhas** e remover `sub` da URL automaticamente, preservando os demais parâmetros.

## Régua do pedido

- Acrescentar `skus_fora_pedido` e `nf_linhas_rateio_incompleto` ao contrato e à consulta de `vw_importacao_pedido_regua`.
- Na etapa **Tradução**, compor o texto pendente apenas com contagens não zeradas, mantendo os três sinais atuais e adicionando:
  - “N SKU fora do pedido”;
  - “N rateio incompleto”.
- Determinar o primeiro motivo na ordem definida: sem SKU, sem custo, ficha XPM, SKU fora do pedido, rateio incompleto.
- Manter os três motivos antigos direcionando para **Pendências**.
- Direcionar os dois motivos novos para `/vendas/produto/chegada-mercadoria?aba=rateio-nf`.

## Verificação

- Executar o typecheck.
- Abrir o detalhe de um pedido no navegador e confirmar que a Conferência não aparece e que `?sub=conferencia` é limpo para Linhas.
- Exercitar a etapa Tradução com os novos sinais para confirmar texto e destino do clique.
- Não publicar.
