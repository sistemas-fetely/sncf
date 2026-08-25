import * as XLSX from "xlsx";
import ExcelJS from "exceljs";

// ============================================================================
// Template de linhas do pedido de MERCADORIA (código do fornecedor / qtd / preço)
// Mesmo padrão de src/lib/compras/templateItens.ts — geração e leitura no cliente.
// ============================================================================

const NOME_ABA_ITENS = "Itens";
const NOME_ABA_LINHAS = "Linhas";
const NOME_ABA_CABECALHO = "Cabecalho";
const NOME_ABA_INSTRUCOES = "Instruções";
const MAX_LINHAS = 1000;
const VERDE_FETELY = "FF1A4A3A";
const BRANCO = "FFFFFFFF";

const COLUNAS = {
  codigo: ["codigo_fornecedor", "codigo fornecedor", "codigo", "código do fornecedor"],
  quantidade: ["quantidade", "qtd"],
  preco: ["preco_unitario", "preco unitario", "preco", "preço unitário"],
} as const;

/** Campos da aba Cabecalho, na ordem em que aparecem no template. */
export const CAMPOS_CABECALHO = [
  "numero_pedido",
  "modalidade",
  "moeda",
  "fornecedor",
  "centro_destino",
  "status",
  "referencia_fornecedor",
  "data_pedido",
  "prazo_entrega_acordado",
  "condicao_pagamento",
  "observacao",
] as const;

export type CampoCabecalho = (typeof CAMPOS_CABECALHO)[number];
export type CabecalhoPlanilha = Partial<Record<CampoCabecalho, string>>;

export interface LinhaMercadoriaValida {
  linhaPlanilha: number;
  codigo: string;
  quantidade: number;
  preco_unitario: number;
}

export interface LinhaMercadoriaInvalida {
  linhaPlanilha: number;
  erro: string;
  codigo: string;
}

export interface ResultadoParseMercadoria {
  erroGlobal: string | null;
  validas: LinhaMercadoriaValida[];
  invalidas: LinhaMercadoriaInvalida[];
  /** Preenchido só quando a planilha traz a aba Cabecalho com algum valor. */
  cabecalho: CabecalhoPlanilha | null;
}


function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function acharColuna(headers: string[], aliases: readonly string[]): number {
  const norm = headers.map(normalizar);
  for (const a of aliases) {
    const i = norm.indexOf(normalizar(a));
    if (i >= 0) return i;
  }
  return -1;
}

function parseNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v === "string") {
    const limpo = v.trim();
    if (!limpo) return null;
    let s = limpo.replace(/\s/g, "").replace(/^(R\$|US\$|\$)/i, "");
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return isFinite(n) ? n : null;
  }
  return null;
}

// ============ Geração (ExcelJS) ============

export async function gerarTemplatePedidoMercadoria(): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Fetely SNCF";
  wb.created = new Date();

  const bordaFina: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: "FFB5B5B5" } },
    left: { style: "thin", color: { argb: "FFB5B5B5" } },
    right: { style: "thin", color: { argb: "FFB5B5B5" } },
    bottom: { style: "thin", color: { argb: "FFB5B5B5" } },
  };

  // ---------- Aba CABECALHO ----------
  const wsCab = wb.addWorksheet(NOME_ABA_CABECALHO, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  CAMPOS_CABECALHO.forEach((campo, i) => {
    wsCab.getColumn(i + 1).width = Math.max(18, campo.length + 4);
    const c = wsCab.getRow(1).getCell(i + 1);
    c.value = campo;
    c.font = { name: "Arial", bold: true, size: 11, color: { argb: BRANCO } };
    c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_FETELY } };
    c.border = bordaFina;
  });
  wsCab.getRow(1).height = 24;
  for (let col = 1; col <= CAMPOS_CABECALHO.length; col++) {
    wsCab.getCell(2, col).border = bordaFina;
  }

  // ---------- Aba LINHAS ----------
  const ws = wb.addWorksheet(NOME_ABA_LINHAS, { views: [{ state: "frozen", ySplit: 1 }] });
  const cabecalhos = ["codigo", "quantidade", "preco"];

  const larguras = [30, 14, 18];
  larguras.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
  const headerRow = ws.getRow(1);
  headerRow.height = 24;
  cabecalhos.forEach((h, i) => {
    const c = headerRow.getCell(i + 1);
    c.value = h;
    c.font = { name: "Arial", bold: true, size: 11, color: { argb: BRANCO } };
    c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_FETELY } };
    c.border = bordaFina;
  });
  ws.getColumn(2).numFmt = "0";
  ws.getColumn(3).numFmt = "#,##0.0000";

  for (let r = 2; r <= 40; r++) {
    for (let col = 1; col <= 3; col++) {
      ws.getCell(r, col).border = bordaFina;
    }
  }

  const exemplos: Array<[string, number, number]> = [
    ["4329372", 12, 4.5],
    ["4329373", 30, 7.2],
  ];
  exemplos.forEach((ex, idx) => {
    ex.forEach((val, colIdx) => {
      const cell = ws.getCell(idx + 2, colIdx + 1);
      cell.value = val;
      cell.font = { name: "Arial", italic: true, color: { argb: "FF808080" }, size: 10 };
    });
  });

  // ---------- Aba INSTRUÇÕES ----------
  const wsInst = wb.addWorksheet(NOME_ABA_INSTRUCOES);
  wsInst.getColumn(1).width = 100;

  wsInst.mergeCells(1, 1, 1, 1);
  const titulo = wsInst.getCell(1, 1);
  titulo.value = "FETÉLY — Pedido de mercadoria para revenda";
  titulo.font = { name: "Arial", bold: true, size: 16, color: { argb: BRANCO } };
  titulo.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  titulo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_FETELY } };
  wsInst.getRow(1).height = 30;

  const instrucoes: string[] = [
    "",
    "Como preencher:",
    "",
    "1. Aba 'Cabecalho' — uma única linha de dados com os campos do pedido.",
    "   Fornecedor, centro_destino, modalidade e status são resolvidos por nome ou código.",
    "   Datas no formato dd/mm/aaaa ou aaaa-mm-dd.",
    "2. Aba 'Linhas' — uma linha por item. Não renomeie nem reordene os cabeçalhos.",
    "3. codigo — é o código do FORNECEDOR, o mesmo que vem na nota dele.",
    "   Não é o nosso SKU. O sistema resolve o SKU pelo de-para de fornecedor.",
    "   Se o código não estiver mapeado, a conferência aponta e você cadastra o de-para.",
    "4. quantidade — número inteiro maior que zero.",
    "5. preco — na moeda do pedido. Use ponto ou vírgula como decimal.",
    "6. Apague as linhas de exemplo antes de importar.",
    `7. Limite: ${MAX_LINHAS} linhas por planilha.`,

  ];
  instrucoes.forEach((texto, i) => {
    const cell = wsInst.getCell(i + 2, 1);
    cell.value = texto;
    cell.alignment = { wrapText: true };
    cell.font = { name: "Arial", size: 11 };
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Fetely_Pedido_Mercadoria_Template.xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============ Leitura (SheetJS) ============

function lerCabecalho(wb: XLSX.WorkBook): CabecalhoPlanilha | null {
  const nome = wb.SheetNames.find((n) => normalizar(n) === normalizar(NOME_ABA_CABECALHO));
  if (!nome) return null;
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], {
    header: 1,
    blankrows: false,
    defval: "",
  });
  if (matriz.length < 2) return null;
  const headers = (matriz[0] as unknown[]).map((h) => String(h ?? ""));
  const linha = matriz[1] as unknown[];
  const out: CabecalhoPlanilha = {};
  for (const campo of CAMPOS_CABECALHO) {
    const i = acharColuna(headers, [campo, campo.replace(/_/g, " ")]);
    if (i < 0) continue;
    const bruto = linha[i];
    let valor: string;
    if (bruto instanceof Date) {
      // Doutrina 128: Date da planilha vem no fuso local — usar componentes locais.
      valor = new Date(Date.UTC(bruto.getFullYear(), bruto.getMonth(), bruto.getDate()))
        .toISOString()
        .slice(0, 10);
    } else {
      valor = String(bruto ?? "").trim();
    }
    if (valor) out[campo] = valor;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export async function parsearPlanilhaMercadoria(file: File): Promise<ResultadoParseMercadoria> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });

  const cabecalho = lerCabecalho(wb);

  const nomeAba =
    wb.SheetNames.find((n) => n === NOME_ABA_LINHAS) ??
    (wb.SheetNames.includes(NOME_ABA_ITENS)
      ? NOME_ABA_ITENS
      : wb.SheetNames.find(
          (n) =>
            n !== NOME_ABA_INSTRUCOES && normalizar(n) !== normalizar(NOME_ABA_CABECALHO),
        ) ?? wb.SheetNames[0]);

  if (!nomeAba) {
    return {
      erroGlobal: "A planilha não contém nenhuma aba legível.",
      validas: [],
      invalidas: [],
      cabecalho,
    };
  }

  const matriz = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nomeAba], {
    header: 1,
    blankrows: false,
    defval: "",
  });

  if (matriz.length === 0) {
    return { erroGlobal: "A aba está vazia.", validas: [], invalidas: [], cabecalho };
  }

  const headers = (matriz[0] as unknown[]).map((h) => String(h ?? ""));
  const iCod = acharColuna(headers, COLUNAS.codigo);
  const iQtd = acharColuna(headers, COLUNAS.quantidade);
  const iPreco = acharColuna(headers, COLUNAS.preco);

  const faltando: string[] = [];
  if (iCod < 0) faltando.push("codigo");
  if (iQtd < 0) faltando.push("quantidade");
  if (iPreco < 0) faltando.push("preco");
  if (faltando.length) {
    return {
      erroGlobal: `Coluna obrigatória ausente: ${faltando.join(", ")}. Baixe o template novamente e mantenha os cabeçalhos.`,
      validas: [],
      invalidas: [],
      cabecalho,
    };
  }

  const dataRows = matriz.slice(1);
  const naoVazias: Array<{ linhaPlanilha: number; row: unknown[] }> = [];
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i] as unknown[];
    if (row.some((c) => String(c ?? "").trim() !== "")) {
      naoVazias.push({ linhaPlanilha: i + 2, row });
    }
  }

  if (naoVazias.length > MAX_LINHAS) {
    return {
      erroGlobal: `A planilha tem ${naoVazias.length} linhas de dados. O limite é ${MAX_LINHAS}.`,
      validas: [],
      invalidas: [],
      cabecalho,
    };
  }

  const validas: LinhaMercadoriaValida[] = [];
  const invalidas: LinhaMercadoriaInvalida[] = [];

  for (const { linhaPlanilha, row } of naoVazias) {
    const codigo = String(row[iCod] ?? "").trim();
    const quantidade = parseNumero(row[iQtd]);
    const preco = parseNumero(row[iPreco]);

    if (!codigo) {
      invalidas.push({ linhaPlanilha, erro: "Código do fornecedor vazio", codigo: "" });
      continue;
    }
    if (quantidade === null) {
      invalidas.push({ linhaPlanilha, erro: "Quantidade não numérica", codigo });
      continue;
    }
    if (quantidade <= 0) {
      invalidas.push({ linhaPlanilha, erro: "Quantidade precisa ser maior que zero", codigo });
      continue;
    }

    validas.push({
      linhaPlanilha,
      codigo,
      quantidade,
      preco_unitario: preco ?? 0,
    });
  }

  return { erroGlobal: null, validas, invalidas, cabecalho };
}


/** Converte linhas válidas no formato que o parser do textarea entende (TAB). */
export function linhasParaTexto(linhas: LinhaMercadoriaValida[]): string {
  return linhas
    .map((l) => `${l.codigo}\t${l.quantidade}\t${String(l.preco_unitario).replace(".", ",")}`)
    .join("\n");
}
