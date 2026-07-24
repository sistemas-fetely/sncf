# Retrato fiel do que o código faz hoje

Fonte única: `supabase/functions/enviar-pedido-bling/index.ts` + RPC `public.criar_remessa`. Nada é proposto — só descrição.

## 1) A NF usa preço por item, e qual preço?

Sim, é sempre item-a-item. O payload envia `itens: [{descricao, produto:{id}, unidade, quantidade, valor}, ...]` (linhas 585–598, 653). O `valor` de cada linha **não é o `valor_unitario` bruto**: é um preço líquido recalculado pela função:

```
somaItensJson  = Σ (it.valor_unitario × it.quantidade)     // preço bruto dos itens
baseItens      = remessaValor − valorFrete                 // valor líquido a distribuir
descontoFator  = baseItens / somaItensJson   (se baseItens < somaItensJson, senão 1)
lineTotal      = valor_unitario × qty × descontoFator
valor (linha)  = lineTotal / qty
```

Ou seja, o preço unitário mandado ao Bling é o bruto **multiplicado pelo `descontoFator`** — um rateio proporcional. Não existe campo de "desconto" por item no payload; o desconto vai embutido no preço unitário.

Fallback avulso (só se `itens` vier vazio): uma única linha `{descricao:"Pedido FOP #.../NN", quantidade:1, valor: totalExato}` (linhas 637–641).

## 2) Como o `desconto_celebra_valor` chega na NF?

**Rateio proporcional entre os itens, embutido no preço unitário.** Nunca é enviado como desconto global (o payload não usa `desconto`/`descontoItem`). O mecanismo é o `descontoFator` acima: como a soma dos itens brutos supera `remessaValor` (que já reflete `valor_liquido = bruto − desconto − bônus PIX), o fator fica < 1 e reduz cada linha proporcionalmente. Depois há um ajuste de centavo de arredondamento aplicado só no último item (linhas 629–635), com guardrail de R$ 5,00 (linhas 618–626) — se a diferença passar disso, aborta 409.

Observações relevantes:
- `remessaValor = remessa.valor_remessa ?? pedido.valor_liquido` (linha 266). Portanto o "alvo" da distribuição é o líquido da **remessa**, não do pedido.
- Frete não entra no rateio: `baseItens = remessaValor − valorFrete`; o frete vai separado em `payload.transporte.frete` (linhas 664–670).
- `totalProdutos = totalExato − valorFrete` e `total = totalExato` (linhas 608–610, 655–656). `totalExato` vem da soma das parcelas quando há título; senão é `remessaValor` (linhas 438–440).
- Bônus PIX também está embutido em `valor_liquido` (portanto em `remessaValor`) — o mesmo rateio o absorve; não é linha separada.

## 3) O payload usa o estado atual do pedido no momento do envio?

**Parcialmente.** O que é lido "ao vivo" no envio: `pedidos` (para `data_pedido`, parceiro, frete, etc.), `titulo_a_receber` (parcelas), `formas_pagamento`, `integracoes_config`, catálogo Bling. Mas **os itens e o valor líquido saem da remessa**, não do pedido:

- `itens = remessa.itens_json` (linha 319).
- `remessaValor = remessa.valor_remessa ?? pedido.valor_liquido` (linha 266).

A RPC `criar_remessa` faz o snapshot no **momento em que a remessa é criada**: copia `pedido_itens` para `itens_json` e `pedidos.valor_liquido` para `valor_remessa` (só cai em `pedido.valor_liquido` se `valor_remessa` for NULL). A `enviar-pedido-bling` cria a remessa /01 automaticamente na hora do envio *apenas se ainda não existir* (linhas 246–261); se já existir remessa, ela é reutilizada como está.

Consequência prática:
- Alterou o desconto **antes** de a remessa /01 existir → o envio cria a remessa naquele instante com o líquido novo, e a NF sai com o valor novo.
- Alterou o desconto **depois** de a remessa existir → o `itens_json` e o `valor_remessa` da remessa continuam com o snapshot antigo; o envio ao Bling ignora o novo `pedido.valor_liquido` e a NF sai com o valor antigo (a menos que a remessa seja atualizada/recriada por outro caminho). Os títulos são lidos "vivos", mas o `fatorRemessa = remessaValor/somaTitulos` reescala as parcelas para bater com o `remessaValor` da remessa — ou seja, o total da NF é ditado pela remessa, não pelo pedido.

Nada mais foi alterado neste plano — investigação apenas.
