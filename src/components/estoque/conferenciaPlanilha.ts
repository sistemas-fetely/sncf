import ExcelJS from "exceljs";

export interface ItemConferencia {
  sku: string;
  enviado: number;
  cod: string | null;
  nome: string | null;
}

export interface ResultadoImportacao {
  erros: string[];
  recebido: Record<string, string>;
  avariado: Record<string, string>;
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const chaveCod = (v: string) => (/^\d+$/.test(v) ? v.replace(/^0+/, "") || "0" : v.toLowerCase());
const rotuloItem = (i: ItemConferencia) => i.cod ?? i.sku;

export async function gerarPlanilhaConferencia(
  itens: ItemConferencia[],
  cab: { titulo: string; pedidoId: string; destino: string },
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Conferência");
  ws.addRow(["Pedido", cab.titulo]);
  ws.addRow(["Pedido ID", cab.pedidoId]);
  ws.addRow(["Destino", cab.destino]);
  ws.addRow([]);
  const h = ws.addRow(["Código", "SKU", "Produto", "Enviado", "Recebido", "Avariado", "Diferença"]);
  h.font = { bold: true };
  [1, 2, 3].forEach((r) => (ws.getCell(r, 1).font = { bold: true }));
  ws.columns = [{ width: 12 }, { width: 22 }, { width: 44 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }];
  itens.forEach((i) => {
    const row = ws.addRow([i.cod ?? "", i.sku, i.nome ?? "", i.enviado, i.enviado, 0, null]);
    const n = row.number;
    row.getCell(1).numFmt = "@";
    row.getCell(7).value = { formula: `E${n}+F${n}-D${n}` };
    [5, 6].forEach((c) => {
      const cell = row.getCell(c);
      cell.protection = { locked: false };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7D6" } };
    });
  });
  await ws.protect("", { selectLockedCells: true, selectUnlockedCells: true });
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function inteiro(v: unknown): number | null {
  if (v === null || v === undefined || txt(v) === "") return null;
  const n = typeof v === "number" ? v : Number(txt(v).replace(",", "."));
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** Valida tudo-ou-nada. `matriz` = sheet_to_json(header:1). Linhas no erro são 1-based (Excel). */
export function validarPlanilhaConferencia(
  matriz: unknown[][],
  itens: ItemConferencia[],
  pedidoId: string,
): ResultadoImportacao {
  const erros: string[] = [];
  const recebido: Record<string, string> = {};
  const avariado: Record<string, string> = {};

  const linhaId = matriz.findIndex((l) => norm(l?.[0]) === "pedido id");
  const idPlanilha = linhaId >= 0 ? txt(matriz[linhaId]?.[1]) : "";
  if (idPlanilha !== pedidoId) erros.push(`Planilha é de outro pedido (${idPlanilha || "vazio"})`);

  const hIdx = matriz.findIndex((l) => {
    const c = (l ?? []).map(norm);
    return c.includes("código") && c.includes("recebido") && c.includes("avariado");
  });
  if (hIdx < 0) {
    erros.push("Cabeçalho da tabela (Código / Recebido / Avariado) não encontrado");
    return { erros, recebido, avariado };
  }
  const cab = (matriz[hIdx] ?? []).map(norm);
  const col = { cod: cab.indexOf("código"), sku: cab.indexOf("sku"), rec: cab.indexOf("recebido"), ava: cab.indexOf("avariado") };

  const porCod = new Map(itens.filter((i) => i.cod).map((i) => [chaveCod(i.cod!), i]));
  const porSku = new Map(itens.map((i) => [i.sku.toLowerCase(), i]));
  const vistoEm = new Map<string, number>();

  for (let r = hIdx + 1; r < matriz.length; r++) {
    const linha = matriz[r] ?? [];
    if (!linha.some((c) => txt(c) !== "")) continue;
    const nLinha = r + 1;
    const cod = col.cod >= 0 ? txt(linha[col.cod]) : "";
    const sku = col.sku >= 0 ? txt(linha[col.sku]) : "";
    const item = (cod && porCod.get(chaveCod(cod))) || (sku && porSku.get(sku.toLowerCase())) || null;
    if (!item) {
      erros.push(`Linha ${nLinha}: Item não pertence a esta transferência (${cod || sku || "sem código"})`);
      continue;
    }
    const anterior = vistoEm.get(item.sku);
    if (anterior) {
      erros.push(`Item ${rotuloItem(item)} repetido (linhas ${anterior} e ${nLinha})`);
      continue;
    }
    vistoEm.set(item.sku, nLinha);
    const rv = linha[col.rec];
    const av = linha[col.ava];
    const rn = inteiro(rv);
    const an = inteiro(av);
    if (rn === null) erros.push(`Linha ${nLinha}: Recebido inválido (${txt(rv) || "em branco"})`);
    if (an === null) erros.push(`Linha ${nLinha}: Avariado inválido (${txt(av) || "em branco"})`);
    if (rn !== null) recebido[item.sku] = String(rn);
    if (an !== null) avariado[item.sku] = String(an);
  }

  itens.forEach((i) => {
    if (!vistoEm.has(i.sku)) erros.push(`Item ${rotuloItem(i)} ausente na planilha`);
  });

  return { erros, recebido, avariado };
}
