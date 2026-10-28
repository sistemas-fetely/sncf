// REGRA 28/10/2026 — SKU É SÓ INTERNO.
// Todo código de produto que SAI para sistema externo (Bling, XPM, Shopify) é
// `sncf_produtos.codigo_externo`. Todo código que ENTRA vira SKU interno via
// `fn_produto_sku_por_codigo`. Legado: codigo_externo = sku (comportamento idêntico).
// Fail-loud: codigo_externo vazio recusa o item — nunca cai no sku.

// deno-lint-ignore no-explicit-any
type Sb = any;

/** SKU interno -> código externo, em lote (lê sncf_produtos). Lança se a leitura falhar. */
export async function mapaCodigoExterno(sb: Sb, skus: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const lista = [...new Set(skus.filter(Boolean))];
  for (let i = 0; i < lista.length; i += 500) {
    const { data, error } = await sb.from("sncf_produtos")
      .select("sku, codigo_externo").in("sku", lista.slice(i, i + 500));
    if (error) throw new Error(`sncf_produtos (codigo_externo): ${error.message}`);
    for (const r of data ?? []) {
      const c = String(r.codigo_externo ?? "").trim();
      if (c) out.set(String(r.sku), c);
    }
  }
  return out;
}

/** Exige o código externo; lança com motivo se vazio. */
export function exigirCodigoExterno(sku: string, codigo: unknown): string {
  const c = String(codigo ?? "").trim();
  if (!c) throw new Error(`SKU ${sku} sem codigo_externo — item recusado`);
  return c;
}

/** Código externo -> SKU interno, em lote (RPC fn_produto_sku_por_codigo, com memo). null se não achar. */
export async function mapaSkuPorCodigo(sb: Sb, codigos: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const lista = [...new Set(codigos.map((c) => String(c ?? "").trim()).filter(Boolean))];
  await Promise.all(lista.map(async (c) => {
    const { data, error } = await sb.rpc("fn_produto_sku_por_codigo", { p_codigo: c });
    if (error) throw new Error(`fn_produto_sku_por_codigo(${c}): ${error.message}`);
    out.set(c, data ? String(data) : null);
  }));
  return out;
}

/** Código externo -> SKU interno (um). null se não achar. */
export async function skuPorCodigo(sb: Sb, codigo: string): Promise<string | null> {
  return (await mapaSkuPorCodigo(sb, [codigo])).get(String(codigo).trim()) ?? null;
}
