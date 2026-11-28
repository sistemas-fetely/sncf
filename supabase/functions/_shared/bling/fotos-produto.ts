// Repositório de Mídia · F3 (mapa-repositorio-midia-v1, 28/11/2026): fotos que o Bling recebe vêm de produto_midia.
// Regra única (sync e nascimento): foto ativa, espelhada (url_original), origem shopify, canal bling;
// principal primeiro, depois as de produto antes das de variante, pela ordem; no máximo 10.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
export const MAX_FOTOS_BLING = 10;
type Linha = { cod_cadastro: string; url_original: string; principal: boolean; vinculo: string; ordem: number };
const ordenar = (a: Linha, b: Linha) =>
  Number(b.principal) - Number(a.principal) || Number(a.vinculo !== "variante") - Number(b.vinculo !== "variante") || a.ordem - b.ordem;
/** Lista de links por cod_cadastro (cods sem foto ficam com []). */
export async function fotosEmLote(sb: SupabaseClient, cods: string[]): Promise<Map<string, string[]>> {
  const unicos = [...new Set(cods.filter(Boolean).map(String))];
  const out = new Map<string, string[]>(unicos.map((c) => [c, []]));
  const linhas: Linha[] = [];
  for (let i = 0; i < unicos.length; i += 200) {
    const lote = unicos.slice(i, i + 200);
    for (let de = 0; ; de += 1000) {
      const r = await sb.from("produto_midia").select("cod_cadastro,url_original,principal,vinculo,ordem")
        .in("cod_cadastro", lote).eq("ativo", true).eq("tipo", "foto").eq("origem", "shopify")
        .not("url_original", "is", null).contains("canais", ["bling"]).order("id").range(de, de + 999);
      if (r.error) throw new Error(`produto_midia: ${r.error.message}`);
      linhas.push(...((r.data ?? []) as Linha[]));
      if (!r.data || r.data.length < 1000) break;
    }
  }
  linhas.sort(ordenar);
  for (const l of linhas) { const a = out.get(l.cod_cadastro)!; if (a.length < MAX_FOTOS_BLING) a.push(l.url_original); }
  return out;
}
export async function fotosParaBling(sb: SupabaseClient, cod_cadastro: string): Promise<string[]> {
  return (await fotosEmLote(sb, [cod_cadastro])).get(cod_cadastro) ?? [];
}
