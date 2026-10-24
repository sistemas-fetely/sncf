import type { SetStateAction } from "react";

/** Resolve um SetStateAction (valor ou função) contra o valor atual. */
export function resolverAcao<T>(v: SetStateAction<T>, atual: T): T {
  return typeof v === "function" ? (v as (p: T) => T)(atual) : v;
}

/** Ordenação {key,dir} ↔ "key:dir"; "nenhum" = sem ordenação explícita. */
export type OrdemKD = { key: string; dir: "asc" | "desc" } | null;
export function lerOrdemKD(s: string): OrdemKD {
  if (!s || s === "nenhum") return null;
  const [key, dir] = s.split(":");
  return key && (dir === "asc" || dir === "desc") ? { key, dir } : null;
}
export function escreverOrdemKD(o: OrdemKD): string {
  return o ? `${o.key}:${o.dir}` : "nenhum";
}

/** Conjunto ↔ "a,b"; vazio = "nenhum" (para não cair no default). */
export function lerConjunto<T extends string>(s: string): Set<T> {
  return new Set(s === "nenhum" ? [] : (s.split(",").filter(Boolean) as T[]));
}
export function escreverConjunto(c: Set<string>): string {
  return c.size === 0 ? "nenhum" : [...c].sort().join(",");
}

/** Lista ↔ "a,b"; vazia = "" (fica fora da URL). Mantém a ordem escolhida. */
export function lerLista(s: string): string[] {
  return s ? s.split(",").filter(Boolean) : [];
}
export function escreverLista(a: string[]): string {
  return a.join(",");
}
