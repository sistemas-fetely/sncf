import ExcelJS from "exceljs";

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
  valores: Record<string, unknown>;
  sugestoes: Record<string, unknown>;
  fase_atual: string | null;
  proxima_fase: string | null;
  pendencias: string[];
  pendencias_medicao?: string[];
}
export interface RespostaExport {
  ok: boolean; erro?: string;
  ficha: CampoFicha[]; opcoes: Record<string, string[]>; produtos: ProdutoExport[];
}

// Ordem visual dos blocos na planilha (blocos desconhecidos vão no fim, em ordem alfabética).
const ORDEM_BLOCO = ["identidade", "fiscal_fisico", "classificacao", "comercial"];
const COR_BLOCO: Record<string, string> = {
  identidade: "FF1F4E79", fiscal_fisico: "FF7F6000", classificacao: "FF375623", comercial: "FF7030A0",
};
const COR_PADRAO = "FF595959";
const AMARELO = "FFFFFF00";
const NOTA_SUGESTAO = "valor só no SNCF — confirme ou corrija";
const LINHAS_LIVRES = 200; // linhas extras editáveis para produto novo

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
  const colFase = nCampos + 1, colFalta = nCampos + 2, colMedir = nCampos + 3;

  // Cabeçalho: 1 = slug (oculta), 2 = faixa do bloco, 3 = rótulo · dono.
  const r1 = ws.getRow(1), r2 = ws.getRow(2), r3 = ws.getRow(3);
  ficha.forEach((f, i) => {
    const c = i + 1;
    r1.getCell(c).value = f.campo;
    const cor = COR_BLOCO[f.bloco] ?? COR_PADRAO;
    const c2 = r2.getCell(c);
    c2.value = legivel(f.bloco);
    c2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cor } };
    c2.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 9 };
    const c3 = r3.getCell(c);
    c3.value = `${rotuloCampo.get(f.campo)} · ${f.dono ?? "—"}`;
    c3.font = { bold: true, name: "Arial", size: 10 };
    c3.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
    c3.alignment = { wrapText: true, vertical: "middle" };
    ws.getColumn(c).width = Math.max(14, Math.min(40, (rotuloCampo.get(f.campo)?.length ?? 10) + 8));
  });
  r1.getCell(colFase).value = "_fase_atual";
  r1.getCell(colFalta).value = "_pendencias_proxima";
  r1.getCell(colMedir).value = "_pendencias_medicao";
  for (const [c, t] of [[colFase, "Fase atual"], [colFalta, tituloFalta], [colMedir, "Falta medir"]] as const) {
    const c2 = r2.getCell(c);
    c2.value = "Situação (FOP)";
    c2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC00000" } };
    c2.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 9 };
    const c3 = r3.getCell(c);
    c3.value = t;
    c3.font = { bold: true, name: "Arial", size: 10 };
    c3.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
  }
  ws.getColumn(colFase).width = 14;
  ws.getColumn(colFalta).width = 50;
  ws.getColumn(colMedir).width = 40;
  r1.hidden = true;
  r3.height = 32;

  // Dados.
  const ultima = 3 + r.produtos.length + LINHAS_LIVRES;
  r.produtos.forEach((p, idx) => {
    const row = ws.getRow(4 + idx);
    ficha.forEach((f, i) => {
      const cell = row.getCell(i + 1);
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

  // Travas + listas: campo importável fica destravado em todas as linhas de dado.
  for (let lin = 4; lin <= ultima; lin++) {
    const row = ws.getRow(lin);
    ficha.forEach((f, i) => {
      const cell = row.getCell(i + 1);
      const editavel = f.importavel_planilha !== false;
      cell.protection = { locked: !editavel };
      if (!editavel) cell.fill = cell.fill ?? { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
      const ref = refLista.get(f.campo);
      if (ref && editavel) {
        cell.dataValidation = { type: "list", allowBlank: true, formulae: [ref], showErrorMessage: true,
          errorTitle: rotuloCampo.get(f.campo) ?? f.campo, error: "Escolha um valor da lista." };
      }
    });
    row.getCell(colFase).protection = { locked: true };
    row.getCell(colFalta).protection = { locked: true };
    row.getCell(colMedir).protection = { locked: true };
  }

  ws.views = [{ state: "frozen", ySplit: 3, xSplit: 0 }];
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: colMedir } };
  await ws.protect("", {
    selectLockedCells: true, selectUnlockedCells: true, formatColumns: true, formatRows: true,
    autoFilter: true, sort: true,
  });

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
