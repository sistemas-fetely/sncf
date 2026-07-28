import * as XLSX from "xlsx";

export interface LinhaImportadaValida {
  linhaPlanilha: number;
  descricao: string;
  quantidade: number;
  valor_estimado_unitario: number;
  urls: string[];
  especificacao_tecnica: string;
}

export interface LinhaImportadaInvalida {
  linhaPlanilha: number;
  erro: string;
  raw: Record<string, unknown>;
}

export interface ResultadoParse {
  erroGlobal: string | null;
  validas: LinhaImportadaValida[];
  invalidas: LinhaImportadaInvalida[];
}

const NOME_ABA = "Itens";
const MAX_LINHAS = 500;

// Cabeçalhos canônicos e seus aliases normalizados
const COLUNAS = {
  descricao: ["descricao"],
  quantidade: ["quantidade"],
  valor: ["valor unitario"],
  urls: ["urls de referencia", "urls"],
  especificacao: ["especificacao tecnica", "especificacao"],
} as const;

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
    // remove separador de milhar (.) quando há vírgula decimal; senão remove só espaços
    let s = limpo.replace(/\s/g, "");
    if (s.includes(",")) {
      s = s.replace(/\./g, "").replace(",", ".");
    }
    const n = Number(s);
    return isFinite(n) ? n : null;
  }
  return null;
}

export function gerarTemplateItens(): void {
  const wb = XLSX.utils.book_new();

  const cabecalhos = [
    "Descrição",
    "Quantidade",
    "Valor unitário",
    "URLs de referência",
    "Especificação técnica",
  ];
  const exemplos: Array<Array<string | number>> = [
    [
      "Papel A4 75g resma 500 folhas",
      10,
      28.9,
      "https://loja.exemplo.com/papel-a4;https://outra.com/produto",
      "Marca Chamex ou equivalente, alvura 90%",
    ],
    [
      "Cadeira ergonômica escritório",
      2,
      1250,
      "https://fornecedor.com/cadeira",
      "Base cromada, apoio lombar ajustável, cor preta",
    ],
    ["Cabo HDMI 2m", 5, "39,90", "", ""],
  ];

  const wsItens = XLSX.utils.aoa_to_sheet([cabecalhos, ...exemplos]);
  wsItens["!cols"] = [
    { wch: 40 },
    { wch: 12 },
    { wch: 16 },
    { wch: 40 },
    { wch: 40 },
  ];
  XLSX.utils.book_append_sheet(wb, wsItens, NOME_ABA);

  const instrucoes: string[][] = [
    ["Instruções — Template de itens do pedido de compra"],
    [""],
    ["Colunas obrigatórias: Descrição, Quantidade e Valor unitário."],
    ["Quantidade e Valor unitário precisam ser maiores que zero."],
    ["Valor unitário aceita 1.234,56 ou 1234.56."],
    ["URLs de referência: várias separadas por ponto e vírgula (;)."],
    ["Especificação técnica é opcional."],
    [""],
    ["Não renomeie, não reordene e não apague a linha de cabeçalho da aba 'Itens'."],
    ["Apague as linhas de exemplo antes de preencher com seus dados."],
    [""],
    ["Limite: 500 linhas por planilha. Acima disso, divida em vários arquivos."],
  ];
  const wsInst = XLSX.utils.aoa_to_sheet(instrucoes);
  wsInst["!cols"] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, wsInst, "Instruções");

  XLSX.writeFile(wb, "Fetely_Pedido_Compra_Itens_Template.xlsx");
}

export async function parsearPlanilhaItens(file: File): Promise<ResultadoParse> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  const nomeAba = wb.SheetNames.includes(NOME_ABA) ? NOME_ABA : wb.SheetNames[0];
  if (!nomeAba) {
    return {
      erroGlobal: "A planilha não contém nenhuma aba legível.",
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
    return {
      erroGlobal: "A aba está vazia.",
      validas: [],
      invalidas: [],
    };
  }

  const headers = (matriz[0] as unknown[]).map((h) => String(h ?? ""));
  const iDesc = acharColuna(headers, COLUNAS.descricao);
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
      validas: [],
      invalidas: [],
    };
  }

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
      validas: [],
      invalidas: [],
    };
  }

  const validas: LinhaImportadaValida[] = [];
  const invalidas: LinhaImportadaInvalida[] = [];

  for (const { linhaPlanilha, row } of naoVazias) {
    const raw: Record<string, unknown> = {
      descricao: row[iDesc],
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
    });
  }

  return { erroGlobal: null, validas, invalidas };
}
