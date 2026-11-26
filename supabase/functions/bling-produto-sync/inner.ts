import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
export function innerConfirmado(inner: unknown, evidencia: boolean): boolean {
  const n = Number(inner);
  return Number.isInteger(n) && (n > 1 || (n === 1 && evidencia));
}
const lotes = <T>(a: T[], n = 300) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
/** Inner em lote (cartório + evidência da importação) para várias fontes; chave = sku. */
export async function innersEmLote(sb: SupabaseClient, fontes: Record<string, any>[]) {
  const eans = [...new Set(fontes.map((f) => f.ean).filter(Boolean).map(String))];
  const innerPorEan = new Map<string, number | null>();
  for (const l of lotes(eans)) {
    const r = await sb.from("cartorio_codigo").select("ean,inner_qtd").in("ean", l);
    if (r.error) throw new Error(r.error.message);
    for (const x of r.data ?? []) innerPorEan.set(String(x.ean), x.inner_qtd ?? null);
  }
  const comUm = fontes.filter((f) => f.ean && Number(innerPorEan.get(String(f.ean))) === 1);
  const evid = new Set<string>();
  for (const chave of ["ean", "sku"] as const) {
    const vals = [...new Set(comUm.map((f) => f[chave]).filter(Boolean).map(String))];
    for (const l of lotes(vals)) {
      const r = await sb.from("importacao_linha").select(chave).eq("qtd_kits_inner", 1).in(chave, l);
      if (r.error) throw new Error(r.error.message);
      for (const x of (r.data ?? []) as any[]) evid.add(`${chave}:${x[chave]}`);
    }
  }
  return new Map(fontes.map((f) => {
    const inner = f.ean ? innerPorEan.get(String(f.ean)) ?? null : null;
    const evidencia = evid.has(`ean:${f.ean}`) || evid.has(`sku:${f.sku}`);
    return [f.sku as string, { inner_qtd: inner, inner_confirmado: innerConfirmado(inner, evidencia) }];
  }));
}
export async function fonteComInner(sb: SupabaseClient, fonte: Record<string, any>) {
  return { ...fonte, ...(await innersEmLote(sb, [fonte])).get(fonte.sku) };
}
