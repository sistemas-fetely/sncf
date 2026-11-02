/**
 * Leitura da planilha de tabela de preço de transportadora (pura, testada).
 * Dois layouts detectados automaticamente:
 *  - "faixas_fixas": cabeçalho com tarifa_code, uf, zona_nome, ate_N…, fpk, fv_pct, txa
 *  - "por_kg" (Icaro): A=código <PREFIXO>-<CAPITAL|INTERIOR>-<UF>-<prazo>-<x>, B=prazo, C ignorada,
 *    colunas de peso 1..N kg, VALOR EXCEDENTE, ADV, GRIS(D).
 */

export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE",
  "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];

export type LayoutPlanilha = "faixas_fixas" | "por_kg";

export interface TarifaPlanilha {
  linha: number;
  tarifa_code: string;
  codigo_original: string;
  uf: string;
  tipo: string | null;
  prazo: number | null;
  modelo_peso: LayoutPlanilha;
  pesos: Record<string, number>;
  kg_adicional: number | null;
  adv_pct: number | null;
  gris_pct: number | null;
  fv_pct: number | null;
  txa: number | null;
  erros: string[];
  avisos: string[];
}

export interface PlanilhaLida {
  layout: LayoutPlanilha | null;
  tarifas: TarifaPlanilha[];
  /** erros que não pertencem a uma linha (layout, cabeçalho) */
  erros: string[];
}

const arred2 = (n: number) => Math.round(n * 100) / 100;

/** Número de célula: aceita number do xlsx e texto pt-BR ("1.234,56") ou ponto decimal. */
export function numCelula(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s) return null;
  const norm = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

const vazio = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

export function detectarLayout(cabecalho: unknown[]): LayoutPlanilha | null {
  const h = cabecalho.map((c) => String(c ?? "").trim().toLowerCase());
  if (h.includes("tarifa_code")) return "faixas_fixas";
  if (h.some((c) => c.includes("excedente"))) return "por_kg";
  return null;
}

/** CTP-CAPITAL-AC-11-0 → { tipo: CAPITAL, uf: AC, prazo: 11, tarifa_code: CAPITAL-AC } */
export function lerCodigoPorKg(codigo: string): {
  tipo: string; uf: string; prazo: number | null; tarifa_code: string; erros: string[];
} {
  const partes = codigo.trim().toUpperCase().split("-");
  const erros: string[] = [];
  const tipo = partes[1] ?? "";
  const uf = partes[2] ?? "";
  const prazo = partes[3] && /^\d+$/.test(partes[3]) ? Number(partes[3]) : null;
  if (partes.length < 3) erros.push(`código fora do padrão PREFIXO-CAPITAL|INTERIOR-UF-prazo-x: "${codigo}"`);
  else {
    if (tipo !== "CAPITAL" && tipo !== "INTERIOR") erros.push(`tipo "${tipo}" inválido (CAPITAL ou INTERIOR)`);
    if (!UFS.includes(uf)) erros.push(`UF "${uf}" inválida`);
  }
  return { tipo, uf, prazo, tarifa_code: `${tipo}-${uf}`, erros };
}

function avisosQueda(pesos: Record<string, number>, numerico: (k: string) => number): string[] {
  const ks = Object.keys(pesos).sort((a, b) => numerico(a) - numerico(b));
  const out: string[] = [];
  for (let i = 1; i < ks.length; i++) {
    if (pesos[ks[i]] < pesos[ks[i - 1]]) {
      out.push(`preço cai de ${ks[i - 1]} para ${ks[i]} (${pesos[ks[i - 1]]} → ${pesos[ks[i]]})`);
    }
  }
  return out;
}

function lerPorKg(linhas: unknown[][]): PlanilhaLida {
  const cab = linhas[0] ?? [];
  const erros: string[] = [];
  const idxExc = cab.findIndex((c) => String(c ?? "").toLowerCase().includes("excedente"));
  const idxAdv = cab.findIndex((c) => /^adv/i.test(String(c ?? "").trim()));
  const idxGris = cab.findIndex((c) => /^gris/i.test(String(c ?? "").trim()));
  const colPeso: { idx: number; kg: number }[] = [];
  for (let i = 3; i < idxExc; i++) {
    const n = numCelula(cab[i]);
    if (n === null || Math.round(n) <= 0) {
      erros.push(`cabeçalho de peso inválido na coluna ${i + 1}: "${String(cab[i] ?? "")}"`);
      continue;
    }
    colPeso.push({ idx: i, kg: Math.round(n) });
  }
  if (colPeso.length === 0) erros.push("nenhuma coluna de peso antes de VALOR EXCEDENTE");
  const kgs = colPeso.map((c) => c.kg);
  if (new Set(kgs).size !== kgs.length) erros.push("peso repetido no cabeçalho");

  const tarifas: TarifaPlanilha[] = [];
  linhas.slice(1).forEach((r, i) => {
    if (!r || r.every(vazio)) return;
    const codigo = String(r[0] ?? "").trim();
    const cod = lerCodigoPorKg(codigo);
    const e = [...cod.erros];
    if (!codigo) e.push("código vazio");
    const prazoCel = numCelula(r[1]);
    const pesos: Record<string, number> = {};
    for (const c of colPeso) {
      const n = numCelula(r[c.idx]);
      if (n === null) e.push(`peso ${c.kg} kg vazio ou não numérico`);
      else pesos[String(c.kg)] = arred2(n);
    }
    const exc = idxExc >= 0 ? numCelula(r[idxExc]) : null;
    if (exc === null) e.push("VALOR EXCEDENTE vazio ou não numérico");
    const adv = idxAdv >= 0 ? numCelula(r[idxAdv]) : null;
    const gris = idxGris >= 0 ? numCelula(r[idxGris]) : null;
    tarifas.push({
      linha: i + 2,
      tarifa_code: cod.tarifa_code,
      codigo_original: codigo,
      uf: cod.uf,
      tipo: cod.tipo,
      prazo: prazoCel !== null ? Math.round(prazoCel) : cod.prazo,
      modelo_peso: "por_kg",
      pesos,
      kg_adicional: exc !== null ? arred2(exc) : null,
      adv_pct: adv,
      gris_pct: gris,
      fv_pct: null,
      txa: null,
      erros: e,
      avisos: avisosQueda(pesos, Number),
    });
  });
  return { layout: "por_kg", tarifas, erros };
}

function lerFaixas(linhas: unknown[][]): PlanilhaLida {
  const cab = (linhas[0] ?? []).map((c) => String(c ?? "").trim().toLowerCase());
  const col = (n: string) => cab.indexOf(n);
  const faixas = cab.map((c, i) => ({ c, i })).filter((x) => /^ate_\d+$/.test(x.c));
  const erros: string[] = faixas.length ? [] : ["nenhuma coluna ate_N"];
  const tarifas: TarifaPlanilha[] = [];
  linhas.slice(1).forEach((r, i) => {
    if (!r || r.every(vazio)) return;
    const e: string[] = [];
    const tarifa_code = String(r[col("tarifa_code")] ?? "").trim();
    const uf = String(r[col("uf")] ?? "").trim().toUpperCase();
    if (!tarifa_code) e.push("tarifa_code vazio");
    if (!UFS.includes(uf)) e.push(`UF "${uf}" inválida`);
    const pesos: Record<string, number> = {};
    for (const f of faixas) {
      const n = numCelula(r[f.i]);
      if (n === null) e.push(`${f.c} vazio ou não numérico`);
      else pesos[f.c] = arred2(n);
    }
    const fpk = col("fpk") >= 0 ? numCelula(r[col("fpk")]) : null;
    if (fpk === null) e.push("fpk vazio ou não numérico");
    tarifas.push({
      linha: i + 2,
      tarifa_code,
      codigo_original: tarifa_code,
      uf,
      tipo: null,
      prazo: null,
      modelo_peso: "faixas_fixas",
      pesos,
      kg_adicional: fpk,
      adv_pct: null,
      gris_pct: null,
      fv_pct: col("fv_pct") >= 0 ? numCelula(r[col("fv_pct")]) : null,
      txa: col("txa") >= 0 ? numCelula(r[col("txa")]) : null,
      erros: e,
      avisos: avisosQueda(pesos, (k) => Number(k.slice(4))),
    });
  });
  return { layout: "faixas_fixas", tarifas, erros };
}

/** Marca como erro todo tarifa_code repetido, citando as linhas. */
export function marcarDuplicados(tarifas: TarifaPlanilha[]): TarifaPlanilha[] {
  const porCodigo = new Map<string, number[]>();
  for (const t of tarifas) {
    if (!t.tarifa_code) continue;
    porCodigo.set(t.tarifa_code, [...(porCodigo.get(t.tarifa_code) ?? []), t.linha]);
  }
  return tarifas.map((t) => {
    const ls = porCodigo.get(t.tarifa_code) ?? [];
    if (ls.length < 2) return t;
    return { ...t, erros: [...t.erros, `código ${t.tarifa_code} repetido nas linhas ${ls.join(", ")}`] };
  });
}

export function lerPlanilhaTabelaPreco(linhas: unknown[][]): PlanilhaLida {
  const layout = detectarLayout(linhas[0] ?? []);
  if (!layout) {
    return {
      layout: null,
      tarifas: [],
      erros: ["layout não reconhecido: esperado cabeçalho com tarifa_code (faixas) ou VALOR EXCEDENTE (por kg)"],
    };
  }
  const lida = layout === "por_kg" ? lerPorKg(linhas) : lerFaixas(linhas);
  return { ...lida, tarifas: marcarDuplicados(lida.tarifas) };
}

/** Payload da RPC fn_importar_tabela_preco_v2: campos nulos ficam fora (herdam da vigente). */
export function payloadTarifa(t: TarifaPlanilha): Record<string, unknown> {
  const p: Record<string, unknown> = {
    tarifa_code: t.tarifa_code,
    uf: t.uf,
    modelo_peso: t.modelo_peso,
    pesos: t.pesos,
  };
  if (t.tipo) p.tipo = t.tipo;
  if (t.prazo !== null) p.prazo = t.prazo;
  if (t.kg_adicional !== null) p.kg_adicional = t.kg_adicional;
  if (t.adv_pct !== null) p.adv_pct = t.adv_pct;
  if (t.gris_pct !== null) p.gris_pct = t.gris_pct;
  if (t.fv_pct !== null) p.fv_pct = t.fv_pct;
  if (t.txa !== null) p.txa = t.txa;
  return p;
}

/** Variação % entre vigente e nova; null quando não há base. */
export function variacaoPct(vigente: number | null | undefined, nova: number | null | undefined): number | null {
  if (vigente === null || vigente === undefined || nova === null || nova === undefined) return null;
  if (vigente === 0) return null;
  return ((nova - vigente) / vigente) * 100;
}

export const LIMITE_DESTAQUE_PCT = 20;
export const variacaoDestacada = (v: number | null) => v !== null && Math.abs(v) > LIMITE_DESTAQUE_PCT;

/** "Icaro_Norte_2026.xlsx" → "Icaro Norte 2026" */
export function nomeSugerido(arquivo: string): string {
  return arquivo.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
}
