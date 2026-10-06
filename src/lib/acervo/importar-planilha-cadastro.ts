import ExcelJS from "exceljs";
import type { CampoFicha, ProdutoExport, RespostaExport } from "@/lib/acervo/planilha-cadastro-xlsx";

/**
 * F2a — leitura da planilha de cadastro e cálculo da diferença contra o FOP (mestre).
 * Localiza slugs e cabeçalho; aceita os layouts antigo e novo. Célula vazia = não mexe.
 */
export const IDENTIDADE = new Set(["cod_cadastro", "sku", "ean", "dun", "fase"]);

export interface LinhaPlanilha { linha: number; cod: string | null; celulas: Record<string, unknown>; liberar: boolean }

export interface Mudanca { campo: string; rotulo: string; de: unknown; para: unknown; confirmando_sugestao?: boolean }
export interface ItemPrevia {
  linha: number; cod: string; sku: string;
  mudancas: Mudanca[]; liberar: boolean; fase_destino: string | null;
  erros: string[];
  sugestoes_ignoradas: number;
  /** Sugestões amarelas deixadas como vieram — só gravadas se o usuário confirmar na prévia. */
  sugestoes_mantidas: Mudanca[];
}
export interface Previa { itens: ItemPrevia[]; novos: number[]; total_linhas: number }

function textoCelula(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const o = v as unknown as Record<string, unknown>;
    if ("result" in o) return o.result as unknown;
    if ("richText" in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("text" in o) return o.text as unknown;
    return null;
  }
  return v;
}

const vazio = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

export async function lerPlanilha(arquivo: File): Promise<LinhaPlanilha[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await arquivo.arrayBuffer());
  const ws = wb.getWorksheet("cadastro") ?? wb.worksheets[0];
  if (!ws) throw new Error("A planilha não tem a aba \"cadastro\".");

  let linhaSlugs = 0;
  for (let r = 1; r <= ws.rowCount; r++) {
    let achouCod = false;
    ws.getRow(r).eachCell({ includeEmpty: false }, (c) => {
      const v = textoCelula(c.value);
      if (typeof v === "string" && v.trim() === "cod_cadastro") achouCod = true;
    });
    if (achouCod) { linhaSlugs = r; break; }
  }
  if (!linhaSlugs) {
    throw new Error("Não foi encontrada uma linha de slugs com cod_cadastro — use a planilha exportada pela Mesa do Produto.");
  }
  const slugs = new Map<number, string>();
  ws.getRow(linhaSlugs).eachCell({ includeEmpty: false }, (c, col) => {
    const s = textoCelula(c.value);
    if (typeof s === "string" && s.trim()) slugs.set(col, s.trim());
  });
  const colCod = [...slugs].find(([, slug]) => slug === "cod_cadastro")?.[0];
  if (!colCod) {
    throw new Error("A linha de slugs não contém cod_cadastro — use a planilha exportada pela Mesa do Produto.");
  }

  const colFase = [...slugs].find(([, slug]) => slug === "_fase_atual")?.[0];
  const colLiberar = [...slugs].find(([, slug]) => slug === "_liberar")?.[0];
  let linhaRotulos = 0;
  for (let r = linhaSlugs + 1; r <= ws.rowCount; r++) {
    const fase = colFase ? String(textoCelula(ws.getRow(r).getCell(colFase).value) ?? "").trim().toLowerCase() : "";
    const liberar = colLiberar ? String(textoCelula(ws.getRow(r).getCell(colLiberar).value) ?? "").trim().toLowerCase() : "";
    if (fase === "fase atual" || liberar === "liberar para venda") { linhaRotulos = r; break; }
  }
  if (!linhaRotulos) throw new Error("Não foi encontrado o cabeçalho de rótulos da planilha.");

  let primeiraLinhaDados = 0;
  for (let r = linhaRotulos + 1; r <= ws.rowCount; r++) {
    if (!vazio(textoCelula(ws.getRow(r).getCell(colCod).value))) { primeiraLinhaDados = r; break; }
  }
  if (!primeiraLinhaDados) return [];

  const colSistema = [...slugs].find(([, slug]) => slug === "_sistema")?.[0];
  const sistemas = new Set(["bling", "shopify", "xpm"]);
  const out: LinhaPlanilha[] = [];
  for (let r = primeiraLinhaDados; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const sistema = colSistema ? String(textoCelula(row.getCell(colSistema).value) ?? "").trim().toLowerCase() : "";
    if (sistemas.has(sistema)) continue;
    const celulas: Record<string, unknown> = {};
    let algum = false;
    for (const [col, slug] of slugs) {
      const v = textoCelula(row.getCell(col).value);
      if (!vazio(v)) { celulas[slug] = typeof v === "string" ? v.trim() : v; if (!slug.startsWith("_")) algum = true; }
    }
    const liberar = String(celulas._liberar ?? "").trim().toLowerCase() === "sim";
    if (!algum && !liberar) continue;
    const cod = vazio(celulas.cod_cadastro) ? null : String(celulas.cod_cadastro).trim();
    out.push({ linha: r, cod, celulas, liberar });
  }
  return out;
}

function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s/g, "");
  const n = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^-?\d+(\.\d+)?$/.test(n)) return null;
  return Number(n);
}
function booleano(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  const t = String(v ?? "").trim().toLowerCase();
  if (["sim", "true", "verdadeiro", "s", "1"].includes(t)) return true;
  if (["não", "nao", "false", "falso", "n", "0"].includes(t)) return false;
  return null;
}

/** Converte a célula para o tipo do valor atual no FOP; devolve null + erro se não converter. */
function normalizar(cel: unknown, atual: unknown): { valor: unknown; erro?: string } {
  if (typeof atual === "boolean") {
    const b = booleano(cel);
    return b === null ? { valor: null, erro: `"${String(cel)}" não é Sim/Não` } : { valor: b };
  }
  if (typeof atual === "number" || typeof cel === "number") {
    const n = numero(cel);
    if (n !== null) return { valor: n };
    if (typeof atual === "number") return { valor: null, erro: `"${String(cel)}" não é número` };
  }
  return { valor: String(cel).trim() };
}

function igual(a: unknown, b: unknown) {
  if (vazio(a) && vazio(b)) return true;
  if (typeof b === "number") { const n = numero(a); return n !== null && Math.abs(n - b) < 1e-9; }
  if (typeof b === "boolean") return booleano(a) === b;
  return String(a ?? "").trim() === String(b ?? "").trim();
}

export function calcularPrevia(linhas: LinhaPlanilha[], r: RespostaExport): Previa {
  const ficha = new Map<string, CampoFicha>(r.ficha.map((f) => [f.campo, f]));
  const porCod = new Map<string, ProdutoExport>();
  for (const p of r.produtos) if (p.cod_cadastro) porCod.set(String(p.cod_cadastro).trim(), p);
  const novos: number[] = [];
  const itens: ItemPrevia[] = [];
  const vistos = new Set<string>();

  for (const l of linhas) {
    if (!l.cod) { novos.push(l.linha); continue; }
    const p = porCod.get(l.cod);
    const erros: string[] = [];
    if (!p) {
      itens.push({ linha: l.linha, cod: l.cod, sku: "", mudancas: [], liberar: l.liberar, fase_destino: null, sugestoes_ignoradas: 0, sugestoes_mantidas: [], erros: [`código ${l.cod} não encontrado no FOP`] });
      continue;
    }
    if (vistos.has(l.cod)) erros.push(`código ${l.cod} repetido na planilha`);
    vistos.add(l.cod);
    const mudancas: Mudanca[] = [];
    const mantidas: Mudanca[] = [];
    let sugeridas = 0;
    for (const [campo, cel] of Object.entries(l.celulas)) {
      if (campo.startsWith("_") || IDENTIDADE.has(campo)) continue;
      const f = ficha.get(campo);
      if (!f || f.importavel_planilha !== true) continue;
      const atual = p.valores[campo];
      if (igual(cel, atual)) continue;
      // Sugestão amarela do SNCF deixada como veio = não confirmada: não grava.
      if (vazio(atual) && !vazio(p.sugestoes?.[campo]) && igual(cel, p.sugestoes[campo])) {
        sugeridas++;
        const nm = normalizar(cel, atual);
        if (!nm.erro) mantidas.push({ campo, rotulo: f.rotulo || campo, de: null, para: nm.valor, confirmando_sugestao: true });
        continue;
      }
      const rotulo = f.rotulo || campo;
      const ops = r.opcoes[campo];
      if (ops?.length && !ops.includes(String(cel).trim())) { erros.push(`${rotulo}: "${String(cel)}" fora da lista válida`); continue; }
      const n = normalizar(cel, atual);
      if (n.erro) { erros.push(`${rotulo}: ${n.erro}`); continue; }
      mudancas.push({ campo, rotulo, de: atual ?? null, para: n.valor, confirmando_sugestao: vazio(atual) && !vazio(p.sugestoes?.[campo]) });
    }
    if (l.liberar && !p.proxima_fase) erros.push("marcado para liberar, mas o produto não tem próxima fase");
    itens.push({
      linha: l.linha, cod: l.cod, sku: p.sku, mudancas,
      liberar: l.liberar && !!p.proxima_fase, fase_destino: p.proxima_fase ?? null, erros, sugestoes_ignoradas: sugeridas, sugestoes_mantidas: mantidas,
    });
  }
  return { itens, novos, total_linhas: linhas.length };
}

/**
 * F4 — portão de formato na prévia: valida o patch de cada SKU no banco
 * (`fn_produto_formato_validar_patch`), 8 por vez. Violação em campo alterado
 * vira erro nomeado e pula a linha; violação em sugestão mantida tira a sugestão.
 */
export async function validarFormatoPrevia(
  previa: Previa,
  validar: (cod: string, campos: Record<string, unknown>) => Promise<{ campo: string; valor: unknown; motivo: string }[]>,
): Promise<Previa> {
  const alvos = previa.itens.filter((i) => !i.erros.length && (i.mudancas.length || i.sugestoes_mantidas.length));
  for (let k = 0; k < alvos.length; k += 8) {
    await Promise.all(alvos.slice(k, k + 8).map(async (i) => {
      const campos: Record<string, unknown> = {};
      for (const m of [...i.sugestoes_mantidas, ...i.mudancas]) campos[m.campo] = m.para;
      try {
        const viol = await validar(i.cod, campos);
        const rot = new Map([...i.mudancas, ...i.sugestoes_mantidas].map((m) => [m.campo, m.rotulo]));
        const alterados = new Set(i.mudancas.map((m) => m.campo));
        for (const v of viol) {
          if (alterados.has(v.campo)) i.erros.push(`${rot.get(v.campo) ?? v.campo}: ${v.motivo} — ${v.valor ?? "vazio"}`);
        }
        const ruins = new Set(viol.map((v) => v.campo));
        i.sugestoes_mantidas = i.sugestoes_mantidas.filter((m) => !ruins.has(m.campo) || alterados.has(m.campo));
      } catch (e) {
        i.erros.push(`validação de formato falhou: ${e instanceof Error ? e.message : String(e)}`);
      }
    }));
  }
  return { ...previa, itens: [...previa.itens] };
}
