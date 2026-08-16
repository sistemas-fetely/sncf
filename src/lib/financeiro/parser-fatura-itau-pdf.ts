/**
 * PARSER DETERMINÍSTICO DE FATURA ITAÚ (PDF)
 *
 * POR QUE EXISTE
 * A leitura da fatura por IA é não-determinística e degrada conforme a fatura cresce.
 * O mesmo PDF de agosto (65 lançamentos) foi lido três vezes e deu três resultados:
 *   - 65 itens somando 31.021,10 (certo)
 *   - 66 itens somando 31.407,78 (inventou uma linha)
 *   - 64 itens somando 17.916,25 (perdeu um bloco)
 * Faturas menores (1, 9, 23, 36, 38 lançamentos) sempre funcionaram. Não é bug de
 * modelo, é teto de capacidade.
 *
 * O PDF do Itaú tem camada de texto limpa (produtor "Fiserv / eStatements").
 * Extraindo o texto e aplicando regex, as faturas fecham EXATAMENTE em seis
 * subtotais independentes:
 *   Agosto: nacional 24.272,72 · internacional 6.520,07 · IOF 228,31 · total 31.021,10
 *   Julho:  nacional 32.628,44 · internacional 12.554,09 · IOF 439,51 · total 45.622,04
 *
 * A função devolve null quando NÃO tem certeza (assinatura ausente, sem camada de
 * texto, total não encontrado, ou soma divergindo do total impresso). null significa
 * "não sei ler isto" — quem chamar cai na IA. Nunca devolve resultado parcial.
 *
 * Esta função nasce DESLIGADA de propósito: não está registrada em nenhum fluxo.
 */

import * as pdfjsLib from "pdfjs-dist";
import type { TextItem, TextContent } from "pdfjs-dist/types/src/display/api";
import type {
  FaturaParsed,
  LancamentoFaturaParsed,
} from "./parser-fatura-cartao";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

// ---------------------------------------------------------------------------
// Extração de texto preservando posição horizontal
// ---------------------------------------------------------------------------

interface LinhaTexto {
  indice: number;
  texto: string;
}

function isTextItem(item: TextContent["items"][number]): item is TextItem {
  return "str" in item;
}

/**
 * Monta as linhas de uma página por posição X absoluta (layout -layout).
 *
 * O PDF do Itaú emite os espaços como itens de texto próprios, com um único
 * caractere de espaço e um width enorme (ex.: 52.1 para representar ~13
 * caracteres). Se concatenarmos literalmente `item.str`, a linha vira
 * "26/03  MP*MERCADOLIVRE 04/10 1.424,10" — apenas um espaço real antes do
 * valor, e a regex de lançamento (que exige \s{2,}) não casa.
 *
 * Por isso descartamos os itens cujo `str.trim()` é vazio e reconstruímos o
 * texto a partir da coluna absoluta de cada item: `coluna = round(x / larguraChar)`.
 * O resultado é equivalente ao `pdftotext -layout`: colunas alinhadas por X,
 * com gaps maiores que 2 espaços entre colunas distintas.
 */
function linhasDaPagina(conteudo: TextContent): string[] {
  const itens = conteudo.items
    .filter(isTextItem)
    .filter((i) => i.str.trim() !== "");

  let larguraTotal = 0;
  let caracteresTotal = 0;
  for (const item of itens) {
    if (item.width > 0) {
      larguraTotal += item.width;
      caracteresTotal += item.str.length;
    }
  }
  const larguraChar = caracteresTotal > 0 ? larguraTotal / caracteresTotal : 5;

  const grupos = new Map<number, TextItem[]>();
  for (const item of itens) {
    const y = item.transform[5] as number;
    const chaveExistente = [...grupos.keys()].find((k) => Math.abs(k - y) <= 1);
    const chave = chaveExistente ?? Math.round(y);
    const bucket = grupos.get(chave);
    if (bucket) bucket.push(item);
    else grupos.set(chave, [item]);
  }

  const chavesOrdenadas = [...grupos.keys()].sort((a, b) => b - a); // topo -> base

  const linhas: string[] = [];
  for (const chave of chavesOrdenadas) {
    const linha = (grupos.get(chave) ?? []).slice().sort(
      (a, b) => (a.transform[4] as number) - (b.transform[4] as number),
    );

    let texto = "";
    for (const item of linha) {
      const x = item.transform[4] as number;
      const coluna = Math.max(0, Math.round(x / larguraChar));
      if (coluna > texto.length) {
        texto += " ".repeat(coluna - texto.length);
      } else if (texto.length > 0) {
        texto += " ";
      }
      texto += item.str;
    }

    linhas.push(texto);
  }

  return linhas;
}

async function extrairLinhas(file: File): Promise<LinhaTexto[]> {
  const buffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
    .promise;

  const linhas: LinhaTexto[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const conteudo = await page.getTextContent();
    for (const texto of linhasDaPagina(conteudo)) {
      linhas.push({ indice: linhas.length, texto });
    }
  }
  await doc.cleanup();
  return linhas;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function paraNumero(bruto: string): number {
  const limpo = bruto.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
}

function paraIso(dd: string, mm: string, aaaa: string): string {
  return `${aaaa}-${mm}-${dd}`;
}

const REGEX_LANCAMENTO = /(\d{2})\/(\d{2})\s+(.+?)\s{2,}(-?\s?[\d.]{1,12},\d{2})/g;
const REGEX_RAMO_LOCAL = /^([A-ZÇÃÁÉÍÓÚÊÔ\s]{3,30})\s*\.\s*(.*)$/;
const REGEX_MOEDA_ORIGINAL = /\s{2,}([\d.]+,\d{2})\s+([A-Z]{3})\s+([\d.]+,\d{2})/;
const REGEX_COTACAO = /Dólar de Conversão R\$\s*([\d.]+,\d{2})/;

// ---------------------------------------------------------------------------
// Parser principal
// ---------------------------------------------------------------------------

export async function parsearFaturaItauPdf(
  file: File,
): Promise<FaturaParsed | null> {
  let linhas: LinhaTexto[];
  try {
    linhas = await extrairLinhas(file);
  } catch (erro) {
    console.warn("Parser determinístico Itaú: falha ao extrair texto do PDF", erro);
    return null;
  }

  const textoCompleto = linhas.map((l) => l.texto).join("\n");
  if (textoCompleto.trim().length === 0) {
    console.warn("Parser determinístico Itaú: PDF sem camada de texto.");
    return null;
  }

  // ---------------- assinatura ----------------
  const temBanco =
    textoCompleto.includes("Banco Itaú") || /itau/i.test(textoCompleto);
  const temSecao = textoCompleto.includes("Lançamentos: compras e saques");
  if (!temBanco || !temSecao) {
    return null;
  }

  // ---------------- cabeçalho ----------------
  const mVenc = textoCompleto.match(/Vencimento:\s*(\d{2})\/(\d{2})\/(\d{4})/);
  const dataVencimento = mVenc ? paraIso(mVenc[1], mVenc[2], mVenc[3]) : null;

  const mEmi = textoCompleto.match(/Emissão:\s*(\d{2})\/(\d{2})\/(\d{4})/);
  const dataEmissao = mEmi ? paraIso(mEmi[1], mEmi[2], mEmi[3]) : null;

  const mTotal = textoCompleto.match(/Total desta fatura\s+([\d.]+,\d{2})/);
  if (!mTotal) {
    console.warn("Parser determinístico Itaú: 'Total desta fatura' não encontrado.");
    return null;
  }
  const valorTotal = paraNumero(mTotal[1]);

  let valorPagamentoAnterior: number | null = null;
  const linhaPagamento = linhas.find((l) =>
    l.texto.includes("PAGAMENTO EFETUADO"),
  );
  if (linhaPagamento) {
    const mPag = linhaPagamento.texto.match(/(-?\s?[\d.]{1,12},\d{2})/);
    if (mPag) valorPagamentoAnterior = Math.abs(paraNumero(mPag[1]));
  }

  let cartaoNumeroFinal: string | null = null;
  const linhaConta = linhas.find((l) => l.texto.includes("Numero da conta"));
  const mMascara = (linhaConta?.texto ?? textoCompleto).match(
    /\d{4}[.\s]+[X\d]{4}[.\s]+[X\d]{4}[.\s]+(\d{4})/,
  );
  if (mMascara) cartaoNumeroFinal = mMascara[1];


  const mDoc = textoCompleto.match(/Número do Documento\s+(\S+)/);
  const numeroDocumento = mDoc ? mDoc[1] : null;

  const anoVencimento = dataVencimento
    ? Number(dataVencimento.slice(0, 4))
    : new Date().getFullYear();
  const mesVencimento = dataVencimento
    ? Number(dataVencimento.slice(5, 7))
    : new Date().getMonth() + 1;

  // ---------------- corte nacional / internacional ----------------
  const indiceInternacional = linhas.findIndex((l) =>
    l.texto.includes("Lançamentos internacionais"),
  );

  // ---------------- lançamentos ----------------
  const lancamentos: LancamentoFaturaParsed[] = [];

  for (const linha of linhas) {
    const natureza: "NACIONAL" | "INTERNACIONAL" =
      indiceInternacional >= 0 && linha.indice >= indiceInternacional
        ? "INTERNACIONAL"
        : "NACIONAL";

    for (const match of linha.texto.matchAll(REGEX_LANCAMENTO)) {
      const dia = match[1];
      const mes = match[2];
      const descricao = match[3].trim();
      const valor = paraNumero(match[4]);

      const mesNum = Number(mes);
      const ano = mesNum > mesVencimento ? anoVencimento - 1 : anoVencimento;

      let parcelaAtual: number | null = null;
      let parcelaTotal: number | null = null;
      const mParcela = descricao.match(/(\d{2})\/(\d{2})$/);
      if (mParcela) {
        parcelaAtual = Number(mParcela[1]);
        parcelaTotal = Number(mParcela[2]);
      }

      let tipo: LancamentoFaturaParsed["tipo"] = "compra";
      if (descricao.toUpperCase().includes("PAGAMENTO EFETUADO")) {
        tipo = "pagamento";
      } else if (valor < 0) {
        tipo = "estorno";
      }

      let ramo: string | null = null;
      let local: string | null = null;
      let moeda = "BRL";
      let valorOriginal: number | null = null;
      let cotacao: number | null = null;

      if (natureza === "NACIONAL") {
        const proxima = linhas[linha.indice + 1]?.texto?.trim() ?? "";
        const mRamo = proxima.match(REGEX_RAMO_LOCAL);
        if (mRamo) {
          ramo = mRamo[1].trim() || null;
          local = mRamo[2].trim() || null;
        }
      } else {
        const seguintes = [
          linhas[linha.indice + 1]?.texto ?? "",
          linhas[linha.indice + 2]?.texto ?? "",
        ].join("\n");
        const mMoeda = seguintes.match(REGEX_MOEDA_ORIGINAL);
        if (mMoeda) {
          moeda = mMoeda[2];
          valorOriginal = paraNumero(mMoeda[3]);
        }
        const mCot = seguintes.match(REGEX_COTACAO);
        if (mCot) cotacao = paraNumero(mCot[1]);
      }

      lancamentos.push({
        data_compra: paraIso(dia, mes, String(ano)),
        descricao,
        valor,
        parcela_atual: parcelaAtual,
        parcela_total: parcelaTotal,
        tipo,
        natureza,
        moeda,
        valor_original: valorOriginal,
        cotacao,
        estabelecimento_descricao: null,
        estabelecimento_local: local,
        ramo_estabelecimento: ramo,
        num_autorizacao: null,
        cnpj_estabelecimento: null,
        linha_original_csv: linha.texto,
        numero_cartao_mascarado: null,
      });
    }
  }

  if (lancamentos.length === 0) {
    console.warn("Parser determinístico Itaú: nenhum lançamento capturado.");
    return null;
  }

  // ---------------- IOF sintético (sem ele a soma não fecha) ----------------
  const mIof = textoCompleto.match(/Repasse de IOF em R\$\s+([\d.]+,\d{2})/);
  if (mIof) {
    const valorIof = paraNumero(mIof[1]);
    if (valorIof > 0) {
      lancamentos.push({
        data_compra: dataEmissao ?? dataVencimento ?? "",
        descricao: "REPASSE DE IOF - TRANSACOES INTERNACIONAIS",
        valor: valorIof,
        parcela_atual: null,
        parcela_total: null,
        tipo: "iof",
        natureza: "NACIONAL",
        moeda: "BRL",
        valor_original: null,
        cotacao: null,
        estabelecimento_descricao: null,
        estabelecimento_local: null,
        ramo_estabelecimento: null,
        num_autorizacao: null,
        cnpj_estabelecimento: null,
        linha_original_csv: mIof[0],
        numero_cartao_mascarado: null,
      });
    }
  }

  // ---------------- autoconferência ----------------
  const soma = lancamentos
    .filter((l) => l.tipo !== "pagamento")
    .reduce((acc, l) => acc + l.valor, 0);
  const diferenca = Math.abs(soma - valorTotal);

  if (diferenca > 0.02) {
    console.warn(
      `Parser determinístico Itaú: soma dos lançamentos (${soma.toFixed(2)}) não fecha com o total impresso (${valorTotal.toFixed(2)}). Diferença de ${diferenca.toFixed(2)}. Caindo para a IA.`,
    );
    return null;
  }

  const datas = lancamentos
    .filter((l) => l.tipo !== "iof" && l.data_compra)
    .map((l) => l.data_compra)
    .sort();

  return {
    formato: "pdf_itau",
    cartao_numero_final: cartaoNumeroFinal,
    data_vencimento: dataVencimento,
    data_emissao: dataEmissao,
    periodo_inicio: datas[0] ?? null,
    periodo_fim: datas[datas.length - 1] ?? null,
    valor_total: valorTotal,
    valor_pagamento_anterior: valorPagamentoAnterior,
    valor_saldo_atraso: null,
    numero_documento: numeroDocumento,
    lancamentos,
    alertas: [
      `Parser determinístico Itaú: ${lancamentos.length} lançamentos, soma confere com o total impresso.`,
    ],
  };
}
