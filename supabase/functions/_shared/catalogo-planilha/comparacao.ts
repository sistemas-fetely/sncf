export type CampoCatalogo = { campo: string; importavel_planilha?: boolean | null; onde_resolver?: string | null; contexto_planilha?: boolean | null };
export type TipoComparacao = "mudanca" | "conflito" | "ja_igual" | "sem_cadastro" | "erro";
export type LinhaCatalogo = { linha: number; cod_cadastro: string; celulas: Record<string, unknown> };
// Identity/status columns may be present in the layout, but never become writable cells.
export const SOMENTE_LEITURA = new Set(["cod_cadastro", "sku", "ean", "dun", "fase", "ativo", "_sistema", "_fase_atual", "_pendencias_proxima", "_pendencias_medicao", "_liberar"]);
export function normalizarCodigo(v: unknown): string {
  const s = String(v ?? "").trim();
  return /^\d{1,5}$/.test(s) ? s.padStart(5, "0") : s;
}
export function vazio(v: unknown) { return v == null || (typeof v === "string" && !v.trim()); }
export function normalizarValor(v: unknown): string | null {
  if (vazio(v)) return null;
  return String(v).trim();
}
export function compararCelula(base: unknown, planilha: unknown, sistema: unknown): TipoComparacao | null {
  const p = normalizarValor(planilha), b = normalizarValor(base), s = normalizarValor(sistema);
  if (p == null || p === b) return null;
  if (s === p) return "ja_igual";
  return s === b ? "mudanca" : "conflito";
}
export function donoCampo(campo: CampoCatalogo): "operacoes" | "produto" {
  // The four fiscal fields are routed by the current field matrix. Other SNCF fields
  // (identity, quantities etc.) must not silently become Operations' remit.
  return campo.onde_resolver === "SNCF" && ["ncm", "cest", "origem_fisc", "origem_prod"].includes(campo.campo) ? "operacoes" : "produto";
}
export function validarSlugs(slugs: string[], ficha: CampoCatalogo[]) {
  const conhecidos = new Set([...ficha.map(f => f.campo), ...SOMENTE_LEITURA]);
  if (!slugs.includes("cod_cadastro")) throw new Error("Layout quebrado: linha 3 sem cod_cadastro.");
  const vistos = new Set<string>();
  for (const s of slugs.filter(Boolean)) {
    if (!conhecidos.has(s)) throw new Error(`Layout quebrado: slug desconhecido ${s}.`);
    if (vistos.has(s)) throw new Error(`Layout quebrado: slug duplicado ${s}.`);
    vistos.add(s);
  }
}