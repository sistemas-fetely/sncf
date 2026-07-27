Investigação read-only. Sem alterações a aplicar.

## 1. Pastas `bling` em `supabase/functions/`
- `enviar-pedido-bling`
- `sincronizar-cache-bling`
- `sync-bling-financeiro`
- `sync-contato-bling`

## 2. Criação/atualização de produtos no Bling
**Não existe.** Nenhuma edge function faz `POST`/`PUT`/`PATCH` para `/produtos` do Bling. Os únicos writes ao Bling são `POST /pedidos/vendas` (enviar-pedido-bling:654) e `POST /contatos` (sync-contato-bling:154).

Em `enviar-pedido-bling/index.ts` a lógica de "cria-se-não-acha" **foi removida**. Hoje só resolve por GET no código; se não achar, o guardrail bloqueia com HTTP 409. Trecho (linhas 475-527):

```ts
const acharPorCodigo = async (): Promise<number | null> => {
  try {
    const r = await client.get(`/produtos?codigo=${encodeURIComponent(skuTrim)}&limite=100`);
    const m = (r?.data || []).find((p: any) => String(p.codigo || "").trim() === skuTrim);
    if (m?.id) return m.id;
  } catch (_) {}
  try {
    const r = await client.get(`/produtos?criterio=2&q=${encodeURIComponent(skuTrim)}&limite=100`);
    const m = (r?.data || []).find((p: any) => String(p.codigo || "").trim() === skuTrim);
    if (m?.id) return m.id;
  } catch (_) {}
  return null;
};

blingProdId = await acharPorCodigo();

// NÃO cria produto no Bling. O "cria-se-não-acha" gerava lixo/duplicata no catálogo.
// Se não achou pelo código, deixa não-resolvido → o guardrail FAIL-LOUD abaixo
// bloqueia o envio e lista o SKU pra correção manual.

// Guardrail:
if (itensSemProdutoBling.length > 0) {
  return err(
    `${itensSemProdutoBling.length} produto(s) não encontrado(s) nem criado(s) no Bling — ` +
    `verifique os logs do Bling e cadastre manualmente antes de reenviar: ${nomes}`,
    409,
  );
}
```

`sincronizar-cache-bling` e `sync-bling-financeiro/sync-produtos.ts` só fazem `GET /produtos` para popular caches/espelho locais.
