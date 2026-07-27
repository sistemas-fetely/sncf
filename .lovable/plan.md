Investigação read-only da edge function `sincronizar-estoque-shopify` concluída.

## Achado

**A edge function lê direto de `vw_estoque_shopify_sync`.** Não monta query própria e não calcula diff no código.

### Trecho exato (linhas 82–86 de `supabase/functions/sincronizar-estoque-shopify/index.ts`)

```ts
const { data: rows, error: viewErr } = await supabase
  .from("vw_estoque_shopify_sync")
  .select("sku, inventory_item_id, location_id, shopify_atual, sncf_virtual, diff")
  .neq("diff", 0);
```

### Filtros próprios

Apenas `.neq("diff", 0)` — ignora linhas sem divergência. Nenhum filtro adicional de SKU no código. A lista de SKUs empurrada ao Shopify é 100% o que a view devolve.

## Conclusão

Sua alteração em `vw_estoque_shopify_sync` (filtrar só SKU lastreado no razão) **tem efeito direto** no que a edge function empurra pro Shopify. A view é a fonte única de verdade dessa sync.

Nenhuma mudança de código proposta.
