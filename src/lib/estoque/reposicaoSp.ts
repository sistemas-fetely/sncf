import type { Database } from "@/integrations/supabase/types";

export type ReposicaoSp = Database["public"]["Views"]["vw_reposicao_sp"]["Row"] & { sku: string; peso_g: number | null };
export type AbaReposicao = "urgente" | "carga";
export type ItemReposicao = { sku: string; nome: string; quantidade: number };
export type CargaReposicao = { itens: ItemReposicao[]; aba: AbaReposicao };
export const linhasReposicao = (linhas: ReposicaoSp[], aba: AbaReposicao) => linhas.filter(l => l.ritmo === "urgente" || (aba === "carga" && l.ritmo === "carga"));
export function totaisReposicao(itens: ItemReposicao[], linhas: ReposicaoSp[]) {
  const pesos = new Map(linhas.map(l => [l.sku, l.peso_g]));
  return { skus: itens.length, kits: itens.reduce((s, i) => s + i.quantidade, 0), pesoKg: itens.reduce((s, i) => s + i.quantidade * (pesos.get(i.sku) ?? 0) / 1000, 0), semPeso: itens.filter(i => !(Number(pesos.get(i.sku)) > 0)).length };
}
export function lerCargaReposicao(state: unknown): CargaReposicao | null {
  if (!state || typeof state !== "object" || !("reposicaoSp" in state)) return null;
  const carga = state.reposicaoSp;
  if (!carga || typeof carga !== "object" || !("itens" in carga) || !("aba" in carga) || !Array.isArray(carga.itens) || !["urgente", "carga"].includes(String(carga.aba))) return null;
  const itens = carga.itens.filter((i): i is ItemReposicao => !!i && typeof i.sku === "string" && typeof i.nome === "string" && Number.isInteger(i.quantidade) && i.quantidade > 0);
  return itens.length === carga.itens.length && itens.length > 0 ? { itens, aba: carga.aba as AbaReposicao } : null;
}
export type FreteReposicao = { chave: string; nome: string; transportadoraId: string; valor: number; prazo: number | null; servico?: string; codigo?: string | null };
export function escolherFrete(opcoes: FreteReposicao[], aba: AbaReposicao) {
  return [...opcoes].sort((a, b) => aba === "urgente" ? (a.prazo ?? Infinity) - (b.prazo ?? Infinity) || a.valor - b.valor : a.valor - b.valor || (a.prazo ?? Infinity) - (b.prazo ?? Infinity))[0] ?? null;
}