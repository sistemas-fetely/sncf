import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";

/**
 * F1 — Planilha de cadastro de produto (FOP é o mestre).
 * Colunas, rótulos, donos e travas vêm de produto_ficha_nascimento (via edge exportar-planilha-produto).
 * Linha 1 (oculta) = slug do campo, para a importação (F2) casar coluna → campo.
 */

export interface CampoFicha {
  campo: string; bloco: string; dono: string | null; ordem: number;
  rotulo: string | null; importavel_planilha: boolean | null; dim_tabela: string | null;
}
export interface ProdutoExport {
  sku: string;
  cod_cadastro?: string | null;
  valores: Record<string, unknown>;
  sugestoes: Record<string, unknown>;
  fase_atual: string | null;
  proxima_fase: string | null;
  pendencias: string[];
  pendencias_medicao?: string[];
}
export interface CampoDestinoExport {
  campo: string;
  sistema: "Bling" | "Shopify" | "XPM" | string;
  campo_destino: string;
  rotulo_tela: string | null;
}
export interface RespostaExport {
  ok: boolean; erro?: string;
  ficha: CampoFicha[]; opcoes: Record<string, string[]>; destinos?: CampoDestinoExport[]; produtos: ProdutoExport[];
}

// Ordem visual dos blocos na planilha (blocos desconhecidos vão no fim, em ordem alfabética).
const ORDEM_BLOCO = ["identidade", "fiscal_fisico", "classificacao", "comercial"];
const COR_BLOCO: Record<string, string> = {
  identidade: "FF1F4E79", fiscal_fisico: "FF7F6000", classificacao: "FF375623", comercial: "FF7030A0",
};
const COR_PADRAO = "FF595959";
const AMARELO = "FFFFFF00";
const NOTA_SUGESTAO = "valor só no SNCF — confirme ou corrija";
const LINHAS_LIVRES = 300;
const IDENT_BANCO = new Set(["sku", "ean", "dun", "fase"]); // linhas extras editáveis para produto novo
const SISTEMAS = ["Bling", "Shopify", "XPM"] as const;
const COR_SISTEMA: Record<(typeof SISTEMAS)[number], string> = {
  Bling: "FFEAF2F8",
  Shopify: "FFEAF6EC",
  XPM: "FFFDF1E6",
};

const legivel = (s: string | null | undefined) => {
  if (!s) return "";
  const t = s.replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

function colLetra(n: number) {
  let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function ordenarFicha(ficha: CampoFicha[]) {
  const pos = (b: string) => { const i = ORDEM_BLOCO.indexOf(b); return i < 0 ? 100 : i; };
  return [...ficha].sort((a, b) => pos(a.bloco) - pos(b.bloco) || a.bloco.localeCompare(b.bloco) || a.ordem - b.ordem);
}

function valorCelula(v: unknown): ExcelJS.CellValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function nomeArquivoCadastro(colecoes: string[]) {
  const d = new Date();
  const data = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const base = colecoes.length === 1 ? colecoes[0] : colecoes.length ? "varias_colecoes" : "catalogo";
  const slug = base.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").toLowerCase();
  return `cadastro_produto_${slug || "catalogo"}_${data}.xlsx`;
}

export async function gerarPlanilhaCadastro(r: RespostaExport): Promise<Blob> {
  const ficha = ordenarFicha(r.ficha);
  const rotuloCampo = new Map(ficha.map((f) => [f.campo, f.rotulo || legivel(f.campo)]));
  const destinos = new Map<string, CampoDestinoExport[]>();
  for (const d of r.destinos ?? []) {
    const chave = `${d.campo}|${d.sistema}`;
    (destinos.get(chave) ?? destinos.set(chave, []).get(chave))?.push(d);
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = "SNCF";
  const ws = wb.addWorksheet("cadastro");
  const listas = wb.addWorksheet("listas", { state: "veryHidden" });

  // Aba de listas: uma coluna por campo com opções.
  const refLista = new Map<string, string>();
  let colL = 0;
  for (const f of ficha) {
    const ops = r.opcoes[f.campo];
    if (!ops?.length) continue;
    colL++;
    const L = colLetra(colL);
    listas.getCell(`${L}1`).value = f.campo;
    ops.forEach((o, i) => { listas.getCell(`${L}${i + 2}`).value = o; });
    refLista.set(f.campo, `listas!$${L}$2:$${L}$${ops.length + 1}`);
  }

  const proximas = [...new Set(r.produtos.map((p) => p.proxima_fase).filter(Boolean))] as string[];
  const tituloFalta = proximas.length === 1 ? `Falta para ${legivel(proximas[0])}` : "Falta para a próxima fase";
  const nCampos = ficha.length;
  const colFase = nCampos + 2, colFalta = nCampos + 3, colMedir = nCampos + 4, colLib = nCampos + 5;
  // Gabarito de nascimento: origem e inner_qtd (vazias para os existentes), se a ficha já não as tiver.
  const extras = (["origem", "inner_qtd"] as const).filter((c) => !ficha.some((f) => f.campo === c));
  const colExtra = new Map(extras.map((c, i) => [c, colLib + 1 + i]));
  const colUltima = colLib + extras.length;

  // Cabeçalho: 1 = slug (oculta), 2 = faixa do bloco, 3–5 = de-para, 6 = rótulo · dono.
  const r1 = ws.getRow(1), r2 = ws.getRow(2), r6 = ws.getRow(6);
  r1.getCell(1).value = "_sistema";
  r2.getCell(1).value = "Sistema";
  r2.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_PADRAO } };
  r2.getCell(1).font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 9 };
  r6.getCell(1).value = "Sistema";
  r6.getCell(1).font = { bold: true, name: "Arial", size: 10 };
  r6.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
  ws.getColumn(1).width = 13;
  ficha.forEach((f, i) => {
    const c = i + 2;
    r1.getCell(c).value = f.campo;
    const cor = COR_BLOCO[f.bloco] ?? COR_PADRAO;
    const c2 = r2.getCell(c);
    c2.value = legivel(f.bloco);
    c2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cor } };
    c2.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 9 };
    const c6 = r6.getCell(c);
    c6.value = `${rotuloCampo.get(f.campo)} · ${f.dono ?? "—"}`;
    c6.font = { bold: true, name: "Arial", size: 10 };
    c6.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
    c6.alignment = { wrapText: true, vertical: "middle" };
    ws.getColumn(c).width = Math.max(14, Math.min(40, (rotuloCampo.get(f.campo)?.length ?? 10) + 8));
  });
  r1.getCell(colFase).value = "_fase_atual";
  r1.getCell(colFalta).value = "_pendencias_proxima";
  r1.getCell(colMedir).value = "_pendencias_medicao";
  r1.getCell(colLib).value = "_liberar";
  {
    const c2 = r2.getCell(colLib);
    c2.value = "Ação";
    c2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF00703C" } };
    c2.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 9 };
    const c6 = r6.getCell(colLib);
    c6.value = "Liberar para venda";
    c6.font = { bold: true, name: "Arial", size: 10 };
    c6.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
  }
  ws.getColumn(colLib).width = 18;
  for (const [campo, c] of colExtra) {
    r1.getCell(c).value = campo;
    const c2 = r2.getCell(c);
    c2.value = "Nascimento";
    c2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_PADRAO } };
    c2.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 9 };
    const c6 = r6.getCell(c);
    c6.value = campo === "origem" ? "Origem" : "Inner (caixa master)";
    c6.font = { bold: true, name: "Arial", size: 10 };
    c6.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
    ws.getColumn(c).width = 18;
  }
  for (const [c, t] of [[colFase, "Fase atual"], [colFalta, tituloFalta], [colMedir, "Falta medir"]] as const) {
    const c2 = r2.getCell(c);
    c2.value = "Situação (FOP)";
    c2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC00000" } };
    c2.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 9 };
    const c6 = r6.getCell(c);
    c6.value = t;
    c6.font = { bold: true, name: "Arial", size: 10 };
    c6.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
  }
  ws.getColumn(colFase).width = 14;
  ws.getColumn(colFalta).width = 50;
  ws.getColumn(colMedir).width = 40;
  r1.hidden = true;
  r6.height = 32;

  SISTEMAS.forEach((sistema, indice) => {
    const row = ws.getRow(3 + indice);
    row.getCell(1).value = sistema;
    row.getCell(1).font = { bold: true, name: "Arial", size: 9 };
    for (let c = 1; c <= colUltima; c++) {
      row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_SISTEMA[sistema] } };
    }
    ficha.forEach((f, i) => {
      const cell = row.getCell(i + 2);
      const itens = destinos.get(`${f.campo}|${sistema}`) ?? [];
      if (!itens.length) {
        cell.value = "não vai";
        cell.font = { italic: true, color: { argb: "FFB7B7B7" }, name: "Arial", size: 9 };
        return;
      }
      const richText: ExcelJS.RichText[] = [];
      itens.forEach((d, itemIndice) => {
        if (itemIndice) richText.push({ text: " + ", font: { name: "Arial", size: 9 } });
        richText.push(d.rotulo_tela
          ? { text: d.rotulo_tela, font: { name: "Arial", size: 9 } }
          : { text: d.campo_destino, font: { italic: true, color: { argb: "FF7F7F7F" }, name: "Arial", size: 9 } });
      });
      cell.value = { richText };
      cell.alignment = { wrapText: true, vertical: "middle" };
    });
  });

  // Dados.
  const ultima = 6 + r.produtos.length + LINHAS_LIVRES;
  r.produtos.forEach((p, idx) => {
    const row = ws.getRow(7 + idx);
    ficha.forEach((f, i) => {
      const cell = row.getCell(i + 2);
      const v = p.valores[f.campo];
      if (v !== undefined && v !== null && v !== "") { cell.value = valorCelula(v); return; }
      const s = p.sugestoes[f.campo];
      if (s !== undefined && s !== null && s !== "") {
        cell.value = valorCelula(s);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMARELO } };
        cell.note = NOTA_SUGESTAO;
      }
    });
    row.getCell(colFase).value = legivel(p.fase_atual) || "—";
    row.getCell(colFalta).value = p.proxima_fase
      ? (p.pendencias.length ? p.pendencias.map((x) => rotuloCampo.get(x) ?? x).join(", ") : "nada — pronto")
      : "—";
    const med = p.pendencias_medicao ?? [];
    row.getCell(colMedir).value = med.length ? med.map((x) => rotuloCampo.get(x) ?? legivel(x)).join(", ") : "—";
  });

  // Cinza = "não edite aqui" (identidade/situação). Listas de opções. Sem proteção de aba: a integridade
  // real é da importação (ignora colunas de identidade) + banco.
  for (let lin = 7; lin <= ultima; lin++) {
    const row = ws.getRow(lin);
    const ehNova = !r.produtos[lin - 7];
    ficha.forEach((f, i) => {
      const cell = row.getCell(i + 2);
      // Linha de nascimento: tudo editável, inclusive cod_cadastro (pinagem); EAN/DUN/SKU/fase vêm do banco.
      const editavel = ehNova ? (f.campo === "cod_cadastro" || !IDENT_BANCO.has(f.campo)) : f.importavel_planilha !== false;
      if (!editavel) cell.fill = cell.fill ?? { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
      const ref = refLista.get(f.campo);
      if (ref && editavel) {
        cell.dataValidation = { type: "list", allowBlank: true, formulae: [ref], showErrorMessage: true,
          errorTitle: rotuloCampo.get(f.campo) ?? f.campo, error: "Escolha um valor da lista." };
      }
    });
    // Liberar: usável só em produto exportado com próxima fase.
    const prod = r.produtos[lin - 7];
    const cLib = row.getCell(colLib);
    if (prod && prod.proxima_fase) {
      cLib.dataValidation = { type: "list", allowBlank: true, formulae: ['"Sim"'], showErrorMessage: true,
        errorTitle: "Liberar para venda", error: "Use \"Sim\" ou deixe vazio." };
    } else {
      cLib.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
    }
    for (const [campo, c] of colExtra) {
      const cell = row.getCell(c);
      if (prod) { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } }; continue; }
      if (campo === "origem") {
        cell.dataValidation = { type: "list", allowBlank: true, formulae: ['"nacional,importado"'], showErrorMessage: true,
          errorTitle: "Origem", error: "Use nacional ou importado (vazio = nacional)." };
      }
    }
  }

  ws.views = [{ state: "frozen", ySplit: 6, xSplit: 1 }];
  ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: colUltima } };

  await adicionarAbaBancoGs1(wb);

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/** Aba "Banco GS1": códigos livres do cartório para o usuário pinar na coluna cod_cadastro. Somente leitura. */
async function adicionarAbaBancoGs1(wb: ExcelJS.Workbook) {
  const livres: { codigo: string; ean: string | null }[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from("cartorio_codigo").select("cod_cadastro, ean")
      .eq("estado", "estoque").order("cod_cadastro").range(de, de + 999);
    if (error) throw new Error(`Leitura do banco GS1 falhou: ${error.message}`);
    livres.push(...(data ?? []).map((d) => ({ codigo: String(d.cod_cadastro ?? ""), ean: d.ean })));
    if (!data || data.length < 1000) break;
  }
  const gs = wb.addWorksheet("Banco GS1");
  gs.mergeCells(1, 1, 1, 2);
  const inst = gs.getCell(1, 1);
  inst.value = "Copie o Código para a coluna cod_cadastro da aba de produtos para escolher qual código o produto novo recebe. EAN e DUN são do código — nunca digite.";
  inst.alignment = { wrapText: true, vertical: "middle" };
  inst.font = { italic: true };
  gs.getRow(1).height = 45;
  const h = gs.getRow(3);
  h.values = ["Código", "EAN"];
  h.font = { bold: true };
  h.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7EEF8" } }; });
  livres.forEach((l, i) => { const r = gs.getRow(4 + i); r.getCell(1).value = String(l.codigo); r.getCell(2).value = l.ean ?? ""; });
  gs.getColumn(1).width = 14; gs.getColumn(2).width = 18;
  gs.views = [{ state: "frozen", ySplit: 3 }];
}
