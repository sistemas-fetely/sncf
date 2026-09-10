// Leitura de PI (proforma da fabrica). O cabecalho varia da linha 5 a 18 entre os 5 formatos e os nomes das colunas nao repetem entre fornecedores — por isso deteccao por sinonimo (pi_coluna_sinonimo), nunca posicao fixa.

import * as XLSX from "xlsx";

export type MatchSinonimo = { campo: string; sinonimo: string; formato: string | null };

export type CabecalhoDetectado = {
  /** numero REAL da linha na planilha (1-based) */
  linhaCabecalho: number;
  colunas: string[];
  camposCasados: number;
  mapeamentoSugerido: Record<string, string>;
  formatoProvavel: string | null;
  usouDuasLinhas: boolean;
};

const IGNORAR = "— ignorar —";
const LINHAS_VARRIDAS = 25;
const LIMITE_VAZIAS = 0.4;

export function normalizar(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function indexar(sinonimos: MatchSinonimo[]): Map<string, MatchSinonimo> {
  const m = new Map<string, MatchSinonimo>();
  for (const s of sinonimos) {
    const k = normalizar(s.sinonimo);
    if (k && !m.has(k)) m.set(k, s);
  }
  return m;
}

function textoCelula(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

function casados(colunas: string[], indice: Map<string, MatchSinonimo>): MatchSinonimo[] {
  const out: MatchSinonimo[] = [];
  for (const c of colunas) {
    const s = indice.get(normalizar(c));
    if (s) out.push(s);
  }
  return out;
}

function larguraMaxima(matriz: unknown[][], ate: number): number {
  let w = 0;
  for (let i = 0; i < Math.min(ate, matriz.length); i++) {
    w = Math.max(w, matriz[i]?.length ?? 0);
  }
  return w;
}

function linhaComo(matriz: unknown[][], idx: number, largura: number): string[] {
  const linha = matriz[idx] ?? [];
  return Array.from({ length: largura }, (_, i) => textoCelula(linha[i]));
}

export function detectarCabecalho(
  matriz: unknown[][],
  sinonimos: MatchSinonimo[],
): CabecalhoDetectado | null {
  if (!matriz.length) return null;
  const indice = indexar(sinonimos);
  const teto = Math.min(LINHAS_VARRIDAS, matriz.length);
  const largura = Math.max(larguraMaxima(matriz, teto + 1), 1);

  let melhorIdx = -1;
  let melhorContagem = 0;
  for (let i = 0; i < teto; i++) {
    const n = casados(linhaComo(matriz, i, largura), indice).length;
    // empate fica com a menor linha: só troca quando é estritamente maior
    if (n > melhorContagem) {
      melhorContagem = n;
      melhorIdx = i;
    }
  }
  if (melhorIdx < 0 || melhorContagem === 0) return null;

  let colunas = linhaComo(matriz, melhorIdx, largura);
  let usouDuasLinhas = false;

  // Cabecalho em DUAS linhas com celulas mescladas (formato Rocabella).
  const vazias = colunas.filter((c) => c === "").length;
  if (vazias / colunas.length > LIMITE_VAZIAS && melhorIdx + 1 < matriz.length) {
    const baixo = linhaComo(matriz, melhorIdx + 1, largura);
    const juntas = colunas.map((c, i) => `${c} ${baixo[i]}`.trim());
    const n = casados(juntas, indice).length;
    if (n > melhorContagem) {
      colunas = juntas;
      melhorContagem = n;
      usouDuasLinhas = true;
    }
  }

  const mapeamentoSugerido: Record<string, string> = {};
  const porFormato = new Map<string, number>();
  colunas.forEach((c, i) => {
    const s = indice.get(normalizar(c));
    if (!s) return;
    const chave = c || `coluna_${i + 1}`;
    mapeamentoSugerido[chave] = s.campo;
    if (s.formato) porFormato.set(s.formato, (porFormato.get(s.formato) ?? 0) + 1);
  });

  let formatoProvavel: string | null = null;
  let maior = 0;
  porFormato.forEach((n, f) => {
    if (n > maior) {
      maior = n;
      formatoProvavel = f;
    }
  });

  return {
    // a linha do cabecalho e a detectada, mesmo quando concatenamos com a seguinte
    linhaCabecalho: melhorIdx + 1,
    colunas,
    camposCasados: melhorContagem,
    mapeamentoSugerido,
    formatoProvavel,
    usouDuasLinhas,
  };
}

function paraNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const cru = String(v).trim().replace(/[^\d,.-]/g, "");
  if (!cru || cru === "-") return null;
  const pt = cru.includes(",") ? cru.replace(/\./g, "").replace(",", ".") : cru;
  const n = Number(pt);
  return Number.isFinite(n) ? n : null;
}

/** Texto com zero a esquerda preservado. O Excel entrega numero e o zero se perde. */
function paraCodigo(v: unknown, tamanho: number): string | null {
  if (v === null || v === undefined || v === "") return null;
  const bruto = typeof v === "number" ? String(Math.round(v)) : String(v).trim();
  if (!bruto) return null;
  const so = /^\d+$/.test(bruto) ? bruto : bruto.replace(/\s+/g, "");
  if (!so) return null;
  return /^\d+$/.test(so) && so.length < tamanho ? so.padStart(tamanho, "0") : so;
}

function paraTexto(v: unknown): string | null {
  const s = textoCelula(v);
  return s === "" ? null : s;
}

function coagir(campo: string, valor: unknown): unknown {
  switch (campo) {
    case "ean":
      return paraCodigo(valor, 13);
    case "dun":
      return paraCodigo(valor, 14);
    case "cod_cadastro":
      return paraCodigo(valor, 5);
    case "inner_qtd":
    case "qtd":
    case "peso_g":
      return paraNumero(valor);
    default:
      return paraTexto(valor);
  }
}

export function extrairLinhas(
  matriz: unknown[][],
  linhaCabecalho: number,
  mapeamento: Record<string, string>,
  colunas: string[],
): { linhaNum: number; bruto: Record<string, unknown>; campos: Record<string, unknown> }[] {
  const inicio = linhaCabecalho; // linhaCabecalho e 1-based → dados começam nesse indice
  const saida: {
    linhaNum: number;
    bruto: Record<string, unknown>;
    campos: Record<string, unknown>;
  }[] = [];

  for (let i = inicio; i < matriz.length; i++) {
    const linha = matriz[i] ?? [];
    // Pula somente a linha 100% vazia. Falta de campo e julgamento do banco.
    if (!linha.some((c) => textoCelula(c) !== "")) continue;

    const bruto: Record<string, unknown> = {};
    const campos: Record<string, unknown> = {};

    colunas.forEach((nome, c) => {
      const chave = nome || `coluna_${c + 1}`;
      bruto[chave] = linha[c] ?? null;
      const campo = mapeamento[chave];
      if (!campo || campo === IGNORAR) return;
      campos[campo] = coagir(campo, linha[c]);
    });

    saida.push({ linhaNum: i + 1, bruto, campos });
  }

  return saida;
}

export async function lerArquivo(
  file: File,
): Promise<{ abas: string[]; matrizPorAba: Record<string, unknown[][]> }> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const matrizPorAba: Record<string, unknown[][]> = {};
  for (const nome of wb.SheetNames) {
    matrizPorAba[nome] = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], {
      header: 1,
      raw: true,
      defval: null,
    }) as unknown[][];
  }
  return { abas: wb.SheetNames, matrizPorAba };
}
