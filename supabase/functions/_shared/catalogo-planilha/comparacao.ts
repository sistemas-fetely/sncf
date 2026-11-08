export type CampoCatalogo = { campo: string; importavel_planilha?: boolean | null; onde_resolver?: string | null; contexto_planilha?: boolean | null };
export type TipoComparacao = "mudanca" | "conflito" | "ja_igual" | "sem_cadastro" | "erro";
export type LinhaCatalogo = { linha: number; cod_cadastro: string; celulas: Record<string, unknown> };
// Identity/status columns may be present in the layout, but never become writable cells.
export const SOMENTE_LEITURA = new Set(["cod_cadastro", "sku", "ean", "dun", "fase", "ativo"]);
export function somenteLeitura(campo: string) {
  return campo.startsWith("_") || SOMENTE_LEITURA.has(campo);
}
export function normalizarCodigo(v: unknown): string {
  const s = String(v ?? "").trim();
  return /^\d{1,5}$/.test(s) ? s.padStart(5, "0") : s;
}
export function vazio(v: unknown) { return v == null || (typeof v === "string" && !v.trim()); }
export type ColunaProduto = { type?: string; format?: string };
export function tiposColunasProduto(schema: { definitions?: Record<string, { properties?: Record<string, ColunaProduto> }> }): Record<string, string> {
  const propriedades = schema.definitions?.sncf_produtos?.properties;
  if (!propriedades || !Object.keys(propriedades).length) throw new Error("Metadados dos tipos de sncf_produtos indisponíveis.");
  return Object.fromEntries(Object.entries(propriedades).map(([campo, coluna]) => [campo, coluna.format ?? coluna.type ?? "text"]));
}
export function normalizarValor(v: unknown, tipoColuna = "text"): string | null {
  if (vazio(v)) return null;
  const texto = String(v).trim().replace(/\s+/g, " ");
  if (["boolean", "bool"].includes(tipoColuna)) {
    const booleano = texto.toLocaleLowerCase("pt-BR");
    if (["sim", "s", "true", "1", "verdadeiro"].includes(booleano)) return "true";
    if (["não", "nao", "n", "false", "0", "falso"].includes(booleano)) return "false";
    throw new Error(`Valor booleano inválido: ${texto}.`);
  }
  if (["numeric", "decimal", "integer", "smallint", "bigint", "int2", "int4", "int8", "number", "real", "double precision"].includes(tipoColuna)) {
    const partes = /^([+-]?)(\d+)(?:[.,](\d*))?(?:e([+-]?\d+))?$/i.exec(texto);
    if (!partes) throw new Error(`Valor numérico inválido: ${texto}.`);
    const expoente = Number(partes[4] ?? 0);
    if (!Number.isSafeInteger(expoente) || Math.abs(expoente) > 1000) throw new Error(`Expoente numérico inválido: ${texto}.`);
    const digitos = partes[2] + (partes[3] ?? "");
    const ponto = partes[2].length + expoente;
    const inteiro = (ponto <= 0 ? "0" : digitos.slice(0, ponto).padEnd(ponto, "0")).replace(/^0+(?=\d)/, "");
    const fracao = (ponto < 0 ? "0".repeat(-ponto) + digitos : digitos.slice(ponto)).replace(/0+$/, "");
    const valor = inteiro + (fracao ? `.${fracao}` : "");
    return partes[1] === "-" && valor !== "0" ? `-${valor}` : valor;
  }
  return texto;
}
export function compararCelula(base: unknown, planilha: unknown, sistema: unknown, tipoColuna = "text"): TipoComparacao | null {
  const p = normalizarValor(planilha, tipoColuna), b = normalizarValor(base, tipoColuna), s = normalizarValor(sistema, tipoColuna);
  if (p == null || p === b) return null;
  if (s === p) return "ja_igual";
  return s === b ? "mudanca" : "conflito";
}
// Only normalization/comparison belongs in this boundary; database failures must propagate.
export function analisarCelula(base: unknown, planilha: unknown, sistema: unknown, tipoColuna = "text") {
  try {
    const valor_base = normalizarValor(base, tipoColuna);
    const valor_planilha = normalizarValor(planilha, tipoColuna);
    const valor_sistema = normalizarValor(sistema, tipoColuna);
    return { valor_base, valor_planilha, valor_sistema, tipo: compararCelula(valor_base, valor_planilha, valor_sistema, tipoColuna), erro: null };
  } catch (e) {
    return {
      valor_base: base ?? null,
      valor_planilha: planilha ?? null,
      valor_sistema: sistema ?? null,
      tipo: "erro" as const,
      erro: e instanceof Error ? e.message : String(e),
    };
  }
}
export function donoCampo(campo: CampoCatalogo): "operacoes" | "produto" {
  // The four fiscal fields are routed by the current field matrix. Other SNCF fields
  // (identity, quantities etc.) must not silently become Operations' remit.
  return campo.onde_resolver === "SNCF" && ["ncm", "cest", "origem_fisc", "origem_prod"].includes(campo.campo) ? "operacoes" : "produto";
}
export function validarSlugs(slugs: string[], ficha: CampoCatalogo[], colunasProduto: string[] = []) {
  const camposFicha = new Set(ficha.map(f => f.campo));
  const conhecidos = new Set([...camposFicha, ...SOMENTE_LEITURA, ...colunasProduto]);
  const colunasIgnoradas: string[] = [];
  if (!slugs.includes("cod_cadastro")) throw new Error("Layout quebrado: linha 3 sem cod_cadastro.");
  const vistos = new Set<string>();
  for (const s of slugs.filter(Boolean)) {
    if (!s.startsWith("_") && !conhecidos.has(s)) throw new Error(`Layout quebrado: slug desconhecido ${s}.`);
    if (vistos.has(s)) throw new Error(`Layout quebrado: slug duplicado ${s}.`);
    vistos.add(s);
    if (somenteLeitura(s) || !camposFicha.has(s)) colunasIgnoradas.push(s);
  }
  return { colunas_ignoradas: colunasIgnoradas };
}