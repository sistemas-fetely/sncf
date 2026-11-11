import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
export function innerConfirmado(inner: unknown, evidencia: boolean): boolean {
  const n = Number(inner);
  return Number.isInteger(n) && (n > 1 || (n === 1 && evidencia));
}
// Enrich both the frozen comparison source and the live pre-PATCH source.
export async function fonteComInner(sb: SupabaseClient, fonte: Record<string, any>) {
  let inner: number | null = null;
  let evidencia = false;
  if (fonte.ean) {
    const r = await sb.from("cartorio_codigo").select("inner_qtd").eq("ean", fonte.ean).maybeSingle();
    if (r.error) throw new Error(r.error.message);
    inner = r.data?.inner_qtd ?? null;
  }
  if (Number(inner) === 1) {
    for (const chave of ["ean", "sku"]) {
      if (!fonte[chave]) continue;
      const r = await sb.from("importacao_linha").select("id").eq("qtd_kits_inner", 1).eq(chave, fonte[chave]).limit(1);
      if (r.error) throw new Error(r.error.message);
      if (r.data?.length) { evidencia = true; break; }
    }
  }
  return { ...fonte, inner_qtd: inner, inner_confirmado: innerConfirmado(inner, evidencia) };
}