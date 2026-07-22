## Bug na raiz

Hoje há **duas implementações** de "confirmar pagamento" convivendo:

- **Correta** — `ConfirmarPortaoPagoDialog` + `PrimeiroPagamentoTab`: chamam `supabase.rpc('confirmar_portao_pago', ...)`. A RPC marca o portão pago, materializa `titulo_a_receber` (gate + parcelas) e avança a fase via trigger. É o caminho canônico.
- **Errada (caminho paralelo)** — `src/hooks/pedidos/useConfirmarPagamento.ts`, usada pelo `ConfirmarPagamentoDialog`. Faz três coisas por fora do banco:
  1. `rpc('registrar_operacao_pedido', { p_tipo_evento: 'pagamento_confirmado', ... })` — insere evento na timeline.
  2. Busca `titulo_a_receber` e chama `rpc('marcar_titulo_pago', ...)` num loop, atualizando `boleto_status` na mão.
  3. `rpc('transicionar_pedido', { p_para_estagio: 'pre_separacao', ... })` — avança a fase manualmente.

Quando o pedido está em `aguardando_pagamento` com portão ainda `provisorio` (sem títulos materializados), o passo 2 não encontra nada e o passo 3 avança assim mesmo → Bling quebra com "Pedido sem títulos".

O `AcoesAguardandoPagamento` em `PedidoDetalhe.tsx` até tenta escolher o dialog certo com `usePedidoPortaoProvisorio`, mas a lista (`FilaPedidosPorArea.tsx`) chama o dialog errado sempre — e mesmo no detalhe, se o `provisorio` não bater (ex.: outro status intermediário), cai no caminho paralelo.

## Estado final

Um único hook `useConfirmarPagamentoPortao` que só chama `confirmar_portao_pago`. Todos os pontos de UI usam esse hook. O caminho paralelo (evento + marcar_titulo_pago + transicionar_pedido no front) sai.

## Arquivos

**Criar**
- `src/hooks/pedidos/useConfirmarPagamentoPortao.ts` — nova mutation única.
  - Chama `supabase.rpc('confirmar_portao_pago', { p_pedido_id, p_data_pagamento, p_observacao })`.
  - Lê o retorno jsonb (`ok`, `titulos_criados`, `total_parcelas`) e usa no toast de sucesso ("N títulos criados / M parcelas").
  - Em erro, propaga `error.message` da exception do banco no toast destrutivo.
  - `onSuccess` invalida: `pedido-detalhe` (por id), `pedidos-fila`, `pedidos-pipeline`, `contas-receber-titulos`, `pedido-portao-provisorio`, `primeiro-pagamento-fila`, `cobranca-fila`, `aguardando-pagamento-fila`.

**Alterar**
- `src/components/pedidos/dialogs/ConfirmarPortaoPagoDialog.tsx`
  - Remover a `useMutation` local que duplica a chamada e passar a usar `useConfirmarPagamentoPortao`. UI (campos data + observação, loading, botões) fica igual.
- `src/pages/Credito/PrimeiroPagamentoTab.tsx`
  - Remover a `useMutation` inline (linhas 36–65) e usar `useConfirmarPagamentoPortao`. Modal e tabela permanecem.
- `src/components/pedidos/FilaPedidosPorArea.tsx`
  - Trocar `ConfirmarPagamentoDialog` pelo `ConfirmarPortaoPagoDialog` no ramo `estagio === "aguardando_pagamento"` (linhas ~440). Remover o import de `ConfirmarPagamentoDialog`.
- `src/pages/Pedidos/PedidoDetalhe.tsx` — função `AcoesAguardandoPagamento`
  - Remover o ramo `else` que usa `ConfirmarPagamentoDialog`. Passar a renderizar **sempre** `ConfirmarPortaoPagoDialog` (a RPC do banco é a fonte de verdade e já valida). Remover o hook `usePedidoPortaoProvisorio` daqui e o import de `ConfirmarPagamentoDialog`.

**Remover**
- `src/hooks/pedidos/useConfirmarPagamento.ts` — hook do caminho paralelo (insere `pagamento_confirmado`, itera `marcar_titulo_pago`, chama `transicionar_pedido`). Some inteiro.
- `src/components/pedidos/dialogs/ConfirmarPagamentoDialog.tsx` — só existe pra hospedar o hook acima e mantém campos (valor recebido, comprovante) que não fazem sentido no modelo portão-primeiro. Some inteiro.

**Não mexer**
- `PedidoTimeline.tsx`: o label `pagamento_confirmado` fica — eventos antigos ainda aparecem. A RPC nova registra evento próprio via trigger no banco; não é problema do front.
- `useConfirmarPagamento.ts` referências de tipos gerados em `types.ts` são auto-gen, ignoradas.

## Como fica o hook (esboço)

```ts
export function useConfirmarPagamentoPortao() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (args: { pedido_id: string; data_pagamento: string; observacao?: string }) => {
      const { data, error } = await (supabase as any).rpc("confirmar_portao_pago", {
        p_pedido_id: args.pedido_id,
        p_data_pagamento: args.data_pagamento,
        p_observacao: args.observacao?.trim() || null,
      });
      if (error) throw error;
      return data as { ok: boolean; titulos_criados?: number; total_parcelas?: number };
    },
    onSuccess: (res, vars) => {
      toast({
        title: "Pagamento confirmado",
        description: `${res.titulos_criados ?? 0} título(s), ${res.total_parcelas ?? 0} parcela(s). Pedido avançou pra pré-faturamento.`,
      });
      [
        ["pedido-detalhe", vars.pedido_id],
        ["pedido-portao-provisorio", vars.pedido_id],
        ["pedidos-fila"], ["pedidos-pipeline"],
        ["contas-receber-titulos"],
        ["primeiro-pagamento-fila"], ["cobranca-fila"], ["aguardando-pagamento-fila"],
      ].forEach((k) => qc.invalidateQueries({ queryKey: k as any }));
    },
    onError: (e: Error) =>
      toast({ title: "Erro ao confirmar pagamento", description: e.message, variant: "destructive" }),
  });
}
```

## Impacto na UX
- Formulário simplifica: só **data do pagamento** + **observação**. Campos "valor recebido" e "comprovante link" saem — não eram usados pela RPC canônica e induziam o operador a achar que o front decide o valor.
- Casa dos Pedidos (lista) e PedidoDetalhe passam a abrir o mesmo dialog do fluxo Cobrança → Primeiro Pagamento. Uma implementação só.
