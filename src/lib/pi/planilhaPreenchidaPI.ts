// Planilha preenchida de PI — o fechamento do ciclo: depois de efetivar no
// cartório e nascer no FOP, esta é a devolutiva ao fornecedor/Thomer.
// DIFERENTE de devolverPlanilhaPI: aqui NÃO se relê o arquivo original (que
// pode nem estar mais no navegador) — o corpo vem de pi_import_stage.bruto,
// com os rótulos exatos que vieram da fábrica, na ordem do jsonb.
// PONTO CRÍTICO: EAN-13 e DUN-14 vão como TEXTO (numFmt "@"). Como número,
// o Excel come o zero à esquerda e o fornecedor recebe código errado.

import ExcelJS from "exceljs";

export type LinhaPlanilhaPreenchida = {
  bruto: Record<string, unknown> | null;
  cod_cadastro: string | null;
  ean: string | null;
  dun: string | null;
  inner_qtd: number | null;
  estado: string | null;
};

function rotuloSituacao(estado: string | null): string {
  if (estado === "efetivado") return "Efetivado";
  if (estado === "reconhecido") return "Conferido";
  return estado ?? "";
}

function textoCelula(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

export function nomeArquivoPlanilhaPreenchida(params: {
  piNumero: string | null;
  fornecedor: string | null;
  loteId: string;
  hoje?: Date;
}): string {
  const { piNumero, fornecedor, loteId } = params;
  const hoje = params.hoje ?? new Date();
  const data = hoje.toISOString().slice(0, 10); // AAAA-MM-DD
  const base = piNumero?.trim()
    ? `PI-${piNumero.trim()}`
    : fornecedor?.trim()
      ? fornecedor.trim()
      : `lote-${loteId.slice(0, 8)}`;
  return `${base}-preenchida-${data}.xlsx`;
}

export async function gerarPlanilhaPreenchida(
  linhas: LinhaPlanilhaPreenchida[],
): Promise<Blob> {
  if (linhas.length === 0) throw new Error("Lote sem linhas no estágio");

  // cabeçalho = chaves do bruto da PRIMEIRA linha, na ordem do jsonb
  const chavesOriginais = Object.keys(linhas[0].bruto ?? {});

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("PI preenchida");

  ws.columns = [
    ...chavesOriginais.map((chave) => ({
      header: chave,
      key: chave,
      width: Math.max(chave.length + 4, 16),
    })),
    { header: "Cód. Cadastro", key: "__cod_cadastro", width: 16 },
    // numFmt "@" força texto — sem isso o Excel trata EAN/DUN como número
    { header: "EAN-13", key: "__ean", width: 18, style: { numFmt: "@" } },
    { header: "DUN-14", key: "__dun", width: 18, style: { numFmt: "@" } },
    { header: "Inner", key: "__inner", width: 10 },
    { header: "Situação", key: "__situacao", width: 14 },
  ];

  for (const l of linhas) {
    const row: Record<string, unknown> = {};
    for (const chave of chavesOriginais) row[chave] = textoCelula(l.bruto?.[chave]);
    row.__cod_cadastro = textoCelula(l.cod_cadastro);
    row.__ean = textoCelula(l.ean);
    row.__dun = textoCelula(l.dun);
    row.__inner = l.inner_qtd ?? null;
    row.__situacao = rotuloSituacao(l.estado);
    ws.addRow(row);
  }

  // cabeçalho: negrito + fundo escuro, padrão das exportações do projeto
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

