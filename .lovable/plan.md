# F5: sobrescrita no Bling por campo (reenvio)

## Situação encontrada
O `modo: "corrigir"` já existe na edge `varrer-divergencia-bling` e atende ao pedido:
- O interruptor `sobrescreve` vem de `produto_campo_destino`. Hoje está ligado só em dun, fase e preco_varejo.
- O card é o canônico. A edge faz GET, altera só os campos ligados num clone do próprio card e faz PUT do card inteiro.
- O ritmo é de cerca de 3 req/s (350 ms). Em 429 ou 5xx há backoff de 1, 2 e 4 segundos; em 401 o token é renovado uma vez.
- Campo vazio no SNCF é pulado com o motivo "SNCF vazio". Violação em `vw_produto_formato_alerta` é pulada com o motivo do formato.
- Cada sobrescrita é gravada em `produto_destino_divergencia`, com valor_sncf = novo e valor_destino = antigo. O lote fica em `produto_destino_varredura` com modo 'corrigir' e totais.
- O corpo aceita `skus`, `limite` e `dry_run`. A paginação e o re-encadeamento são os mesmos do detectar, e a autenticação é por x-cron-secret.

Os dois testes já rodaram em 05/10, às 08:19:
- **(a) dry_run com limite 20:** 20 produtos lidos e 22 mudanças planejadas, nenhuma escrita.
- **(b) real, só no CL-EH-PLT-23-HAL:** 1 produto e 2 campos corrigidos, sem erros.

## O que proponho fazer
1. **Correção pequena de registro.** No dry_run, o lote hoje soma as mudanças planejadas em `corrigidos`. Isso faz parecer que algo foi gravado. A proposta é contar em `planejados`, deixar `corrigidos` em 0 e manter `divergencias` com a contagem. Não muda nenhum comportamento de escrita.
2. **Reconferir o caso (b) sem escrever no Bling.** Rodar `modo:"detectar"` só no CL-EH-PLT-23-HAL. O esperado é que dun e fase não apareçam mais e que inner_qtd e origem_fisc continuem aparecendo, porque estão desligados.
3. **Repetir o (a) com o código atual.** Rodar `modo:"corrigir", dry_run:true, limite:20` e conferir a lista planejada e os pulados.

Os itens 2 e 3 exigem publicar a edge? Não: a edge já está publicada com o código atual. Se você aprovar o item 1, a edge alterada precisa ser publicada para os testes refletirem a mudança. Isso é publicação de função, não do app; confirmo antes.

Não haverá cron, nenhuma mudança em `corrigir-produto-bling`, nenhuma tabela nova e nenhuma migração.

## Detalhes técnicos
- O arquivo alterado, se houver, será só `supabase/functions/varrer-divergencia-bling/index.ts`. A mudança é no acumulador do `detalhe_erros` no modo corrigir: o dry_run soma em `planejados` e não em `corrigidos`.
- A validação é feita com `deno check`, a chamada à edge com x-cron-secret e uma consulta de leitura em `produto_destino_divergencia` pelo lote_id.
- Nada do item (b) real será repetido: o card já foi corrigido.
