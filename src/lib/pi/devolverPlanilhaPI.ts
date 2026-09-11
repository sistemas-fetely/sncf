// Devolve a MESMA planilha que o Thomer mandou, agora com cod_cadastro/EAN/DUN preenchidos.
// Nao e relatorio novo: e o artefato de volta.
// LIMITE CONHECIDO: o SheetJS comunitario nao preserva tudo no ciclo ler->escrever. Valores,
// formulas e estrutura sobrevivem; IMAGENS EMBUTIDAS e parte da formatacao se perdem. As PIs com
// fotos de produto (a do Natal tem 14 MB de imagens) voltam sem elas. Aceito de proposito: o que
// importa na devolucao sao os CODIGOS, e o Thomer ja tem o arquivo original.
// EAN e DUN sao gravados como TEXTO (t:"s") — se fossem numero o zero a esquerda se perderia.

import * as XLSX from "xlsx";

export type PreenchimentoLinha = {
  linhaNum: number; // numero REAL da linha na planilha
  cod_cadastro?: string | null;
  ean?: string | null;
  dun?: string | null;
};

export type ResultadoDevolucao = {
  blob: Blob;
  nomeArquivo: string;
  colunasUsadas: Record<string, string>; // campo -> letra/rotulo da coluna onde escreveu
  colunasCriadas: string[]; // campos que precisaram de coluna nova
  linhasPreenchidas: number;
};

const CAMPOS = ["cod_cadastro", "ean", "dun"] as const;

type CampoAlvo = (typeof CAMPOS)[number];

function indiceParaColuna(idx: number): string {
  return XLSX.utils.encode_col(idx);
}

function nomeArquivoComSufixo(nomeOriginal: string, sufixo: string): string {
  const ultimoPonto = nomeOriginal.lastIndexOf(".");
  if (ultimoPonto <= 0) return `${nomeOriginal}${sufixo}`;
  const base = nomeOriginal.slice(0, ultimoPonto);
  const ext = nomeOriginal.slice(ultimoPonto);
  return `${base}${sufixo}${ext}`;
}

export async function devolverPlanilhaPI(params: {
  file: File; // o arquivo ORIGINAL, relido
  aba: string;
  linhaCabecalho: number; // 1-based, ultima linha do cabecalho
  mapeamento: Record<string, string>; // coluna original -> campo
  colunas: string[]; // nomes das colunas, na ordem
  preenchimentos: PreenchimentoLinha[];
}): Promise<ResultadoDevolucao> {
  const { file, aba, linhaCabecalho, mapeamento, colunas, preenchimentos } = params;

  const wb = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    cellStyles: true,
    cellDates: true,
    bookVBA: true,
  });

  const ws = wb.Sheets[aba];
  if (!ws) throw new Error(`Aba "${aba}" nao encontrada no arquivo`);

  const refAtual = ws["!ref"];
  if (!refAtual) throw new Error("Worksheet sem !ref definido");

  const range = XLSX.utils.decode_range(refAtual);

  const colunasUsadas: Record<string, string> = {};
  const colunasCriadas: string[] = [];

  // Para cada campo-alvo, resolve em qual coluna escrever.
  const colunaPorCampo: Record<CampoAlvo, number> = {
    cod_cadastro: -1,
    ean: -1,
    dun: -1,
  };

  for (const campo of CAMPOS) {
    // 1) procura no mapeamento uma coluna original que aponte para o campo
    let idx = -1;
    for (let c = 0; c < colunas.length; c++) {
      const chave = colunas[c] || `coluna_${c + 1}`;
      if (mapeamento[chave] === campo) {
        idx = c;
        break;
      }
    }

    if (idx >= 0) {
      colunaPorCampo[campo] = idx;
      colunasUsadas[campo] = indiceParaColuna(idx);
      continue;
    }

    // 2) cria coluna nova ao final
    idx = range.e.c + 1;
    range.e.c = idx;

    const headerRef = XLSX.utils.encode_cell({ r: linhaCabecalho - 1, c: idx });
    const antiga = ws[headerRef];
    ws[headerRef] = antiga
      ? { ...antiga, t: "s", v: campo }
      : { t: "s", v: campo };

    colunaPorCampo[campo] = idx;
    colunasCriadas.push(campo);
    colunasUsadas[campo] = indiceParaColuna(idx);
  }

  // Escreve os valores nas linhas.
  let linhasPreenchidas = 0;

  for (const p of preenchimentos) {
    if (p.linhaNum < 1) continue;

    const r = p.linhaNum - 1;
    let preencheuAlguma = false;

    for (const campo of CAMPOS) {
      const valor = p[campo];
      if (valor === null || valor === undefined || valor === "") continue;

      const c = colunaPorCampo[campo];
      if (c < 0) continue;

      const ref = XLSX.utils.encode_cell({ r, c });
      const antiga = ws[ref];
      ws[ref] = antiga
        ? { ...antiga, t: "s", v: String(valor) }
        : { t: "s", v: String(valor) };

      preencheuAlguma = true;
    }

    if (preencheuAlguma) {
      linhasPreenchidas++;
      // estende a altura da planilha se a linha de preenchimento passou do range atual
      range.e.r = Math.max(range.e.r, r);
    }
  }

  ws["!ref"] = XLSX.utils.encode_range(range);

  const out = XLSX.write(wb, {
    bookType: "xlsx",
    type: "array",
    cellStyles: true,
  });

  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  return {
    blob,
    nomeArquivo: nomeArquivoComSufixo(file.name, "-com-codigos"),
    colunasUsadas,
    colunasCriadas,
    linhasPreenchidas,
  };
}
