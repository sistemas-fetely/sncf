# Diagnóstico PED-2289 — frete zerado ao trocar transportadora

## 1. Quem monta a chamada

- **Salvar (card Dados de envio)**: `src/pages/Pedidos/PedidoDetalhe.tsx` linhas 2485–2499 chama `useSalvarDadosEnvio` (`src/hooks/pedidos/useSalvarDadosEnvio.ts` linhas 31–39), que chama `atualizar_frete_pedido`.
  - O botão manda **sempre o formulário inteiro**: `freteTipo: freteTipo || null` e `valorFrete: parseFloat(valorFrete) || 0`. Não existe controle do que foi alterado.
- **Recotar** é outro caminho: `useRecotarTransportadora` chama `fn_aplicar_sugestao_transportadora(p_pedido_id, p_forcar)` (linha 2441). Ele não passa por `atualizar_frete_pedido` e não envia tipo nem valor de frete.
- **Comparar transportadoras → escolher** (linhas 2515–2535, onde está o aviso "...o valor cobrado do cliente não foi alterado. Confirme em Salvar"): só altera `transportadoraId` e `cotacaoApiEscolhida`. Esse caminho **não mexe** em `freteTipo` nem em `valorFrete`.

## 2. Por que foram enviados CIF_ABSORVIDO e 0

O que está confirmado pelo código e pelos dados:
- O evento de 22:27:32 mostra o front mandando `frete_tipo=CIF_ABSORVIDO` e `valor_frete=0`. Antes disso o banco tinha `CIF_REPASSADO` / 98,92, sem nenhuma outra mudança de frete desde 01/10. O servidor estava estável, então o que divergiu foi o **estado local do formulário**.
- O estado começa vazio: `useState("")`, linhas 1202 e 1204. Ele é preenchido pelo efeito das linhas 1424–1443, que copia do pedido sempre que muda a chave `transportadora|peso|frete_tipo|valor_frete`.
- No arquivo, `setFreteTipo` só aparece no efeito (1440) e no `Select` "Tipo frete" (2408). `setValorFrete` só aparece no efeito (1441) e no input (2459). Escolher transportadora ou recotar **não reescreve** o tipo de frete.
- `CIF_ABSORVIDO` é a **primeira opção** do Select (ordem 1 em `frete_tipos`). O `|| 0` transforma campo vazio em 0.

Causa exata da divergência: **não confirmada**. O código só permite três origens:
- (a) O Select de tipo disparou `onValueChange` com a primeira opção. Isso acontece com o `<select>` nativo oculto do Radix (preenchimento automático do navegador ou reset de formulário). O operador também pode ter mexido nele sem querer.
- (b) O input numérico ficou vazio ou em 0 (por exemplo, rolagem do mouse ou apagado) e o `|| 0` converteu.
- (c) O efeito não sincronizou, porque `envioServidorRef` ficou igual a um snapshot anterior. Isso é improvável aqui, já que o banco não mudou.

Seja qual for a origem, o defeito estrutural é o mesmo: **Salvar envia tipo e valor mesmo sem alteração**, e por isso qualquer desvio do estado local vai para o banco.

## 3. O que cada painel lê depois de salvar

- **Banner de sugestão / alerta logístico** (linhas 2186–2189): lê `pedido.alerta_logistica` da query `["pedido-detalhe", id]`. `invalidarPedido` invalida essa query, então ela é **relida do banco** logo depois de salvar.
- **"Bloqueado antes do envio"** (`src/components/pedidos/AcoesRemessa.tsx` linha 240): lê `usePreviaEmpurrarXpm`, chave `["previa-empurrar-xpm", pedido_id]`, com tempo de cache de 60 s. Essa chave **não está** em `src/lib/pedidos/invalidarPedido.ts`. O mesmo vale para `["previa-estoque-xpm", pedido_id]`. Resultado: depois de salvar, o painel **continua mostrando o cache antigo** por até 60 s, ou até a tela ser remontada.

## Correção mínima proposta (não implementada)

1. `PedidoDetalhe.tsx`, no Salvar: comparar com o valor do servidor e mandar `undefined` ou `null` quando não houve alteração.
   - `freteTipo`: enviar só se `freteTipo !== (pedido.frete_tipo ?? "")`.
   - `valorFrete`: enviar só se `valorFreteAlterado` (que já existe, linha 1485). Caso contrário, enviar `null`. Com o novo `COALESCE` da RPC, o valor do banco é mantido.
   - Deixar de usar `parseFloat(valorFrete) || 0`. Campo vazio passa a ser "não alterado", nunca 0.
2. `useSalvarDadosEnvio.ts`: tipar `freteTipo` e `valorFrete` como opcionais (`string | null`, `number | null`) e repassar `?? null`, sem forçar 0.
3. `invalidarPedido.ts`: acrescentar `"previa-empurrar-xpm"` e `"previa-estoque-xpm"` em `CHAVES_POR_PEDIDO`, para o painel de bloqueios ser relido do banco depois de salvar.
4. Opcional, para fechar a origem (a): quando tipo ou valor mudarem, mostrar a mudança antes de confirmar (por exemplo, "Frete: CIF_REPASSADO → CIF_ABSORVIDO, R$ 98,92 → R$ 0,00").

Sem banco, sem migration. Validação: trocar a transportadora pelo Comparar e salvar, confirmando que o evento registra frete 98,92 → 98,92 e tipo mantido. Para não alterar um pedido real, fazer esse teste só se você autorizar.
