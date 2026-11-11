type Consulta = (endpoint: string) => Promise<any>;
export function codigoBling(fonte: { sku: string; codigo_externo?: unknown }): string {
  return fonte.codigo_externo != null && String(fonte.codigo_externo) !== "" ? String(fonte.codigo_externo) : fonte.sku;
}
export function erro404(e: unknown): boolean { return typeof e === "object" && e !== null && "status" in e && e.status === 404; }
export async function resolverProduto(sku: string, idCache: unknown, idOriginal: unknown, get: Consulta) {
  const candidatos = [...new Set([idCache, idOriginal].filter((id) => id != null && String(id) !== "").map(String))];
  let detalhe: Record<string, any> | null = null;
  let fonte = "codigo_exato";
  for (const id of candidatos) {
    try {
      const d = (await get(`/produtos/${encodeURIComponent(id)}`))?.data;
      if (!d?.id) throw new Error("Bling retornou detalhe vazio.");
      if (String(d.codigo ?? "") !== sku) continue;
      detalhe = d; fonte = id === String(idCache) ? "bling_produtos_cache" : "produtos"; break;
    } catch (e) { if (!erro404(e)) throw e; }
  }
  if (!detalhe) {
    const lista = (await get(`/produtos?codigos[]=${encodeURIComponent(sku)}`))?.data;
    if (!Array.isArray(lista)) throw new Error("Bling retornou lista de produtos inválida.");
    const exatos = lista.filter((d) => String(d.codigo ?? "") === sku);
    if (exatos.length > 1) throw new Error(`Bling retornou mais de um produto com código ${sku}.`);
    if (exatos[0]?.id) {
      try { detalhe = (await get(`/produtos/${encodeURIComponent(exatos[0].id)}`))?.data ?? null; }
      catch (e) { if (!erro404(e)) throw e; }
      if (detalhe && (!detalhe.id || String(detalhe.codigo ?? "") !== sku)) throw new Error(`Bling retornou código diferente de ${sku}.`);
    }
  }
  const id = detalhe?.id == null ? null : String(detalhe.id);
  return { detalhe, bling_id: id, resolucao: { fonte: id ? fonte : "sem_vinculo", id_cache: idCache ?? null, id_original: idOriginal ?? null, id_resolvido: id,
    codigo_usado: sku, id_desatualizado: !!idOriginal && String(idOriginal) !== id } };
}
