import * as XLSX from "xlsx";
import ExcelJS from "exceljs";

// ============ Tipos ============

export interface UnidadeRef {
  id: string;
  sigla: string;
  nome: string;
}

export interface CabecalhoPedidoImportado {
  seu_nome: string;
  precisa_ate: string | null; // ISO yyyy-mm-dd ou null
  o_que_precisa: string;
  por_que_precisa: string;
}

export interface LinhaImportadaValida {
  linhaPlanilha: number;
  descricao: string;
  quantidade: number;
  valor_estimado_unitario: number;
  urls: string[];
  especificacao_tecnica: string;
  unidade_id: string | null;
  unidade_sigla: string; // "UN" quando assumido
  unidade_assumida: boolean; // true quando faltava ou não reconhecida
}

export interface LinhaImportadaInvalida {
  linhaPlanilha: number;
  erro: string;
  raw: Record<string, unknown>;
}

export interface ResultadoParse {
  erroGlobal: string | null;
  cabecalho: CabecalhoPedidoImportado | null;
  validas: LinhaImportadaValida[];
  invalidas: LinhaImportadaInvalida[];
}

// ============ Constantes ============

const NOME_ABA_PEDIDO = "Pedido";
const NOME_ABA_ITENS = "Itens";
const NOME_ABA_INSTRUCOES = "Instruções";
const MAX_LINHAS = 500;
const VERDE_FETELY = "FF1A4A3A";
const BRANCO = "FFFFFFFF";

const UNIDADES_TEMPLATE: Array<{ sigla: string; nome: string }> = [
  { sigla: "UN", nome: "Unidade" },
  { sigla: "CX", nome: "Caixa" },
  { sigla: "PCT", nome: "Pacote" },
  { sigla: "RESMA", nome: "Resma" },
  { sigla: "CJ", nome: "Conjunto" },
  { sigla: "PAR", nome: "Par" },
  { sigla: "ROLO", nome: "Rolo" },
  { sigla: "FD", nome: "Fardo" },
  { sigla: "KG", nome: "Quilograma" },
  { sigla: "G", nome: "Grama" },
  { sigla: "L", nome: "Litro" },
  { sigla: "ML", nome: "Mililitro" },
  { sigla: "M", nome: "Metro" },
  { sigla: "M2", nome: "Metro quadrado" },
  { sigla: "CM", nome: "Centímetro" },
  { sigla: "HR", nome: "Hora" },
  { sigla: "MES", nome: "Mês" },
  { sigla: "SERV", nome: "Serviço" },
];

const COLUNAS = {
  descricao: ["descricao"],
  unidade: ["unidade"],
  quantidade: ["quantidade"],
  valor: ["valor unitario"],
  urls: ["urls de referencia", "urls"],
  especificacao: ["especificacao tecnica", "especificacao"],
} as const;

// Rótulos aceitos na aba "Pedido" (normalizados)
const ROTULOS_PEDIDO = {
  seu_nome: ["seu nome", "solicitante", "nome"],
  precisa_ate: ["precisa ate", "data de necessidade", "prazo"],
  o_que_precisa: ["o que voce precisa", "descricao geral", "o que precisa"],
  por_que_precisa: ["por que precisa", "justificativa", "por que voce precisa"],
} as const;

// ============ Helpers ============

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
    const i = norm.indexOf(a);
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
    let s = limpo.replace(/\s/g, "").replace(/^R\$/i, "");
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return isFinite(n) ? n : null;
  }
  return null;
}

function parseDataCelula(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    const yyyy = String(d.y).padStart(4, "0");
    const mm = String(d.m).padStart(2, "0");
    const dd = String(d.d).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    // dd/mm/yyyy ou dd-mm-yyyy
    const m1 = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (m1) {
      const dd = m1[1].padStart(2, "0");
      const mm = m1[2].padStart(2, "0");
      let yyyy = m1[3];
      if (yyyy.length === 2) yyyy = "20" + yyyy;
      return `${yyyy}-${mm}-${dd}`;
    }
    // ISO
    const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
  }
  return null;
}

// ============ Geração do template (ExcelJS) ============

function aplicarBlocoIdentidade(ws: ExcelJS.Worksheet, larguraMerge: number): number {
  ws.mergeCells(1, 1, 1, larguraMerge);
  const c1 = ws.getCell(1, 1);
  c1.value = "FETÉLY";
  c1.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  c1.font = { name: "Arial", bold: true, size: 20, color: { argb: BRANCO } };
  c1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_FETELY } };
  ws.getRow(1).height = 32;

  ws.mergeCells(2, 1, 2, larguraMerge);
  const c2 = ws.getCell(2, 1);
  c2.value = "Pedido de Compra — formulário de solicitação";
  c2.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  c2.font = { name: "Arial", italic: true, size: 11, color: { argb: BRANCO } };
  c2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_FETELY } };
  ws.getRow(2).height = 20;

  return 3; // próxima linha livre
}

export async function gerarTemplateItens(): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Fetely SNCF";
  wb.created = new Date();

  // ---------- Aba PEDIDO ----------
  const wsPedido = wb.addWorksheet(NOME_ABA_PEDIDO);
  wsPedido.getColumn(1).width = 26;
  wsPedido.getColumn(2).width = 60;
  let linha = aplicarBlocoIdentidade(wsPedido, 2);
  linha += 1; // espaço

  const bordaFina: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: "FFB5B5B5" } },
    left: { style: "thin", color: { argb: "FFB5B5B5" } },
    right: { style: "thin", color: { argb: "FFB5B5B5" } },
    bottom: { style: "thin", color: { argb: "FFB5B5B5" } },
  };

  const campos: Array<{ rotulo: string; hint?: string; formato?: string }> = [
    { rotulo: "Seu nome" },
    { rotulo: "Precisa até", hint: "formato dd/mm/aaaa", formato: "dd/mm/yyyy" },
    { rotulo: "O que você precisa", hint: "resumo em 1–2 linhas" },
    { rotulo: "Por que precisa", hint: "justificativa" },
  ];

  for (const campo of campos) {
    const rowNum = linha;
    const rotulo = wsPedido.getCell(rowNum, 1);
    rotulo.value = campo.rotulo + (campo.hint ? ` (${campo.hint})` : "");
    rotulo.font = { name: "Arial", bold: true, size: 11 };
    rotulo.alignment = { vertical: "top", horizontal: "left", wrapText: true };

    const valor = wsPedido.getCell(rowNum, 2);
    valor.value = "";
    valor.alignment = { vertical: "top", horizontal: "left", wrapText: true };
    valor.border = bordaFina;
    if (campo.formato) valor.numFmt = campo.formato;
    wsPedido.getRow(rowNum).height = 42;
    linha += 1;
  }

  // ---------- Aba ITENS ----------
  const wsItens = wb.addWorksheet(NOME_ABA_ITENS, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const cabecalhos = [
    "Descrição",
    "Unidade",
    "Quantidade",
    "Valor unitário",
    "URLs de referência",
    "Especificação técnica",
  ];
  const larguras = [45, 12, 12, 16, 40, 40];
  larguras.forEach((w, i) => {
    wsItens.getColumn(i + 1).width = w;
  });
  const headerRow = wsItens.getRow(1);
  headerRow.height = 24;
  cabecalhos.forEach((h, i) => {
    const c = headerRow.getCell(i + 1);
    c.value = h;
    c.font = { name: "Arial", bold: true, size: 11, color: { argb: BRANCO } };
    c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_FETELY } };
    c.border = bordaFina;
  });

  // Formatos por coluna
  wsItens.getColumn(3).numFmt = "0";
  wsItens.getColumn(4).numFmt = 'R$ #,##0.00';

  // Bordas suaves nas células de dados (linhas 2..30) e wrap na descrição/spec
  for (let r = 2; r <= 30; r++) {
    for (let col = 1; col <= 6; col++) {
      const cell = wsItens.getCell(r, col);
      cell.border = bordaFina;
      if (col === 1 || col === 5 || col === 6) {
        cell.alignment = { vertical: "top", wrapText: true };
      }
    }
  }

  // Validação de dados na coluna Unidade (B2:B501)
  const listaUnidades = UNIDADES_TEMPLATE.map((u) => u.sigla).join(",");
  for (let r = 2; r <= MAX_LINHAS + 1; r++) {
    wsItens.getCell(r, 2).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${listaUnidades}"`],
      showErrorMessage: true,
      errorStyle: "error",
      errorTitle: "Unidade inválida",
      error: "Escolha uma unidade da lista.",
    };
  }

  // Exemplos (itálico + cinza)
  const exemplos: Array<[string, string, number, number, string, string]> = [
    [
      "Papel A4 75g resma 500 folhas",
      "RESMA",
      10,
      28.9,
      "https://loja.exemplo.com/papel-a4;https://outra.com/produto",
      "Marca Chamex ou equivalente, alvura 90%",
    ],
    [
      "Cadeira ergonômica escritório",
      "UN",
      2,
      1250,
      "https://fornecedor.com/cadeira",
      "Base cromada, apoio lombar ajustável, cor preta",
    ],
    ["Cabo HDMI 2m", "UN", 5, 39.9, "", ""],
  ];
  exemplos.forEach((ex, idx) => {
    const rowNum = idx + 2;
    ex.forEach((val, colIdx) => {
      const cell = wsItens.getCell(rowNum, colIdx + 1);
      cell.value = val;
      cell.font = { name: "Arial", italic: true, color: { argb: "FF808080" }, size: 10 };
    });
  });

  // ---------- Aba INSTRUÇÕES ----------
  const wsInst = wb.addWorksheet(NOME_ABA_INSTRUCOES);
  wsInst.getColumn(1).width = 100;
  linha = aplicarBlocoIdentidade(wsInst, 1);
  linha += 1;

  const instrucoes: string[] = [
    "Como preencher este template:",
    "",
    "1. Aba 'Pedido' — informe seu nome, a data em que precisa (dd/mm/aaaa), o que precisa e por que precisa.",
    "2. Aba 'Itens' — uma linha por item. Não renomeie nem reordene os cabeçalhos.",
    "3. Descrição, Quantidade e Valor unitário são obrigatórios; Quantidade e Valor unitário precisam ser maiores que zero.",
    "4. Unidade — escolha uma opção do menu suspenso (UN, CX, PCT, RESMA, KG, etc.). Se ficar em branco, o sistema assume UN.",
    "5. URLs de referência — várias URLs separadas por ponto e vírgula (;).",
    "6. Especificação técnica é opcional.",
    "7. Apague as linhas de exemplo antes de importar.",
    "8. Limite: 500 linhas por planilha. Acima disso, divida em vários arquivos.",
  ];
  for (const linhaTexto of instrucoes) {
    const cell = wsInst.getCell(linha, 1);
    cell.value = linhaTexto;
    cell.alignment = { wrapText: true };
    cell.font = { name: "Arial", size: 11 };
    linha += 1;
  }

  // Download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Fetely_Pedido_Compra_Template.xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============ Parse (SheetJS) ============

function parseCabecalhoPedido(ws: XLSX.WorkSheet | undefined): CabecalhoPedidoImportado | null {
  if (!ws) return null;
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: false, // strings pra manter formatação de data quando possível
  });
  const rawMatriz = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: true,
  });
  const cab: CabecalhoPedidoImportado = {
    seu_nome: "",
    precisa_ate: null,
    o_que_precisa: "",
    por_que_precisa: "",
  };
  let algumPreenchido = false;
  for (let r = 0; r < matriz.length; r++) {
    const row = matriz[r];
    const rotuloRaw = String((row?.[0] ?? "") as unknown);
    if (!rotuloRaw.trim()) continue;
    const rotulo = normalizar(rotuloRaw).replace(/\s*\(.*\)\s*$/, "").trim();
    const val = row?.[1];
    const valStr = String(val ?? "").trim();

    const inList = (arr: readonly string[], s: string) => arr.includes(s);
    if (inList(ROTULOS_PEDIDO.seu_nome, rotulo)) {
      cab.seu_nome = valStr;
      if (valStr) algumPreenchido = true;
    } else if (inList(ROTULOS_PEDIDO.precisa_ate, rotulo)) {
      const rawVal = rawMatriz[r]?.[1] ?? val;
      const iso = parseDataCelula(rawVal);
      cab.precisa_ate = iso;
      if (iso) algumPreenchido = true;
    } else if (inList(ROTULOS_PEDIDO.o_que_precisa, rotulo)) {
      cab.o_que_precisa = valStr;
      if (valStr) algumPreenchido = true;
    } else if (inList(ROTULOS_PEDIDO.por_que_precisa, rotulo)) {
      cab.por_que_precisa = valStr;
      if (valStr) algumPreenchido = true;
    }
  }
  return algumPreenchido ? cab : null;
}

export async function parsearPlanilhaItens(
  file: File,
  unidadesDisponiveis: UnidadeRef[],
): Promise<ResultadoParse> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });

  const cabecalho = parseCabecalhoPedido(
    wb.SheetNames.includes(NOME_ABA_PEDIDO) ? wb.Sheets[NOME_ABA_PEDIDO] : undefined,
  );

  const nomeAba = wb.SheetNames.includes(NOME_ABA_ITENS)
    ? NOME_ABA_ITENS
    : wb.SheetNames.find((n) => n !== NOME_ABA_PEDIDO && n !== NOME_ABA_INSTRUCOES) ??
      wb.SheetNames[0];
  if (!nomeAba) {
    return {
      erroGlobal: "A planilha não contém nenhuma aba legível.",
      cabecalho,
      validas: [],
      invalidas: [],
    };
  }
  const ws = wb.Sheets[nomeAba];
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    blankrows: false,
    defval: "",
  });

  if (matriz.length === 0) {
    return { erroGlobal: "A aba está vazia.", cabecalho, validas: [], invalidas: [] };
  }

  const headers = (matriz[0] as unknown[]).map((h) => String(h ?? ""));
  const iDesc = acharColuna(headers, COLUNAS.descricao);
  const iUnid = acharColuna(headers, COLUNAS.unidade);
  const iQtd = acharColuna(headers, COLUNAS.quantidade);
  const iVal = acharColuna(headers, COLUNAS.valor);
  const iUrls = acharColuna(headers, COLUNAS.urls);
  const iEspec = acharColuna(headers, COLUNAS.especificacao);

  const faltando: string[] = [];
  if (iDesc < 0) faltando.push("Descrição");
  if (iQtd < 0) faltando.push("Quantidade");
  if (iVal < 0) faltando.push("Valor unitário");
  if (faltando.length) {
    return {
      erroGlobal: `Coluna obrigatória ausente: ${faltando.join(", ")}. Baixe o template novamente e mantenha os cabeçalhos.`,
      cabecalho,
      validas: [],
      invalidas: [],
    };
  }

  // Mapa de siglas (normalizadas) -> unidade
  const mapaUnidades = new Map<string, UnidadeRef>();
  for (const u of unidadesDisponiveis) {
    mapaUnidades.set(normalizar(u.sigla), u);
  }
  const unUN = unidadesDisponiveis.find((u) => normalizar(u.sigla) === "un") ?? null;

  const dataRows = matriz.slice(1);
  const naoVazias: Array<{ linhaPlanilha: number; row: unknown[] }> = [];
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i] as unknown[];
    const algum = row.some((c) => String(c ?? "").trim() !== "");
    if (algum) naoVazias.push({ linhaPlanilha: i + 2, row });
  }

  if (naoVazias.length > MAX_LINHAS) {
    return {
      erroGlobal: `A planilha tem ${naoVazias.length} linhas de dados. O limite é ${MAX_LINHAS} — divida em vários arquivos.`,
      cabecalho,
      validas: [],
      invalidas: [],
    };
  }

  const validas: LinhaImportadaValida[] = [];
  const invalidas: LinhaImportadaInvalida[] = [];

  for (const { linhaPlanilha, row } of naoVazias) {
    const raw: Record<string, unknown> = {
      descricao: row[iDesc],
      unidade: iUnid >= 0 ? row[iUnid] : "",
      quantidade: row[iQtd],
      valor_unitario: row[iVal],
      urls: iUrls >= 0 ? row[iUrls] : "",
      especificacao: iEspec >= 0 ? row[iEspec] : "",
    };

    const descricao = String(row[iDesc] ?? "").trim();
    const quantidade = parseNumero(row[iQtd]);
    const valor = parseNumero(row[iVal]);

    if (!descricao) {
      invalidas.push({ linhaPlanilha, erro: "Descrição vazia", raw });
      continue;
    }
    if (quantidade === null) {
      invalidas.push({ linhaPlanilha, erro: "Quantidade inválida", raw });
      continue;
    }
    if (quantidade <= 0) {
      invalidas.push({ linhaPlanilha, erro: "Quantidade precisa ser maior que zero", raw });
      continue;
    }
    if (valor === null) {
      invalidas.push({ linhaPlanilha, erro: "Valor unitário inválido", raw });
      continue;
    }
    if (valor <= 0) {
      invalidas.push({ linhaPlanilha, erro: "Valor unitário precisa ser maior que zero", raw });
      continue;
    }

    // Unidade — tolerante
    let unidadeResolvida: UnidadeRef | null = null;
    let unidadeAssumida = false;
    if (iUnid >= 0) {
      const siglaRaw = String(row[iUnid] ?? "").trim();
      if (!siglaRaw) {
        unidadeResolvida = unUN;
        unidadeAssumida = true;
      } else {
        const hit = mapaUnidades.get(normalizar(siglaRaw));
        if (hit) {
          unidadeResolvida = hit;
        } else {
          unidadeResolvida = unUN;
          unidadeAssumida = true;
        }
      }
    } else {
      unidadeResolvida = unUN;
      unidadeAssumida = true;
    }

    const urlsRaw = iUrls >= 0 ? String(row[iUrls] ?? "") : "";
    const urls = urlsRaw
      .split(";")
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    const espec = iEspec >= 0 ? String(row[iEspec] ?? "").trim() : "";

    validas.push({
      linhaPlanilha,
      descricao,
      quantidade,
      valor_estimado_unitario: valor,
      urls,
      especificacao_tecnica: espec,
      unidade_id: unidadeResolvida?.id ?? null,
      unidade_sigla: unidadeResolvida?.sigla ?? "UN",
      unidade_assumida: unidadeAssumida,
    });
  }

  return { erroGlobal: null, cabecalho, validas, invalidas };
}
