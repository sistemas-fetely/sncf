import * as XLSX from "xlsx";

export interface LinhaDivergencia {
  nf_numero: string | null;
  nf_data_emissao: string | null;
  termos: string | null;
  data_termo: string | null;
  sku: string | null;
  qtd_nf: number | null;
  qtd_recebida: number | null;
  qtd_falta: number | null;
  qtd_excesso: number | null;
  qtd_nao_conforme: number | null;
  preco_unit_nf: number | null;
  valor_falta: number | null;
  valor_nao_conforme: number | null;
  classificacao: string | null;
  em_aberto: boolean | null;
  fornecedor?: string | null;
  numero_pedido?: string | null;
  nome_comercial?: string | null;
  cod_cadastro?: string | null;
}

const n = (v: unknown) => Number(v ?? 0);
const dataBr = (v: string | null | undefined) => {
  if (!v) return "";
  const d = new Date(`${v.slice(0, 10)}T00:00:00`);
  return isNaN(d.getTime()) ? v : d.toLocaleDateString("pt-BR");
};
const FMT_R = '"R$" #,##0.00';
const FMT_Q = "#,##0";

export function temDivergencia(l: LinhaDivergencia): boolean {
  return n(l.qtd_falta) > 0 || n(l.qtd_excesso) > 0 || n(l.qtd_nao_conforme) > 0;
}

function aplicarFormatos(ws: XLSX.WorkSheet, colsQtd: number[], colsR: number[], larguras: number[]) {
  const ref = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  for (let r = ref.s.r; r <= ref.e.r; r++) {
    for (const c of colsQtd) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === "n") cell.z = FMT_Q;
    }
    for (const c of colsR) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === "n") cell.z = FMT_R;
    }
  }
  ws["!cols"] = larguras.map((wch) => ({ wch }));
}

export interface LinhaLiquida {
  numero_pedido: string | null; fornecedor: string | null; sku: string | null; cod_cadastro: string | null;
  nome_comercial: string | null; nfs: string | null; qtd_nf: number | null; qtd_recebida: number | null;
  qtd_recebida_sem_nf: number | null; qtd_nao_conforme: number | null; falta_liquida: number | null;
  excesso_liquido: number | null; preco_unit_nf: number | null; valor_falta_liquida: number | null;
  valor_nao_conforme: number | null; ocorrencias_abertas: number | null; situacao: string | null;
}

export function temDivergenciaLiquida(l: LinhaLiquida): boolean {
  return n(l.falta_liquida) > 0 || n(l.excesso_liquido) > 0 || n(l.qtd_nao_conforme) > 0;
}

export function baixarRelatorioDivergencia(liquidas: LinhaLiquida[], linhas: LinhaDivergencia[]) {
  if (!liquidas.length) throw new Error("Sem linhas de recebimento líquido para este pedido.");
  const numeroPedido = liquidas[0].numero_pedido ?? linhas[0]?.numero_pedido ?? "pedido";
  const fornecedor = liquidas[0].fornecedor ?? linhas[0]?.fornecedor ?? "";
  const hoje = new Date();
  const iso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  const somaL = (ls: LinhaLiquida[], f: keyof LinhaLiquida) => ls.reduce((a, l) => a + n(l[f]), 0);
  const soma = (ls: LinhaDivergencia[], f: keyof LinhaDivergencia) => ls.reduce((a, l) => a + n(l[f]), 0);

  // Resumo: cabeçalho + totais da visão líquida
  const resumo: (string | number)[][] = [
    ["Fornecedor", fornecedor],
    ["Pedido", numeroPedido],
    ["Gerado em", dataBr(iso)],
    [],
    ["NF (kits)", somaL(liquidas, "qtd_nf")],
    ["Recebido (kits)", somaL(liquidas, "qtd_recebida")],
    ["Recebido sem NF (kits)", somaL(liquidas, "qtd_recebida_sem_nf")],
    ["Falta líquida (kits)", somaL(liquidas, "falta_liquida")],
    ["Excesso líquido (kits)", somaL(liquidas, "excesso_liquido")],
    ["Não conforme (kits)", somaL(liquidas, "qtd_nao_conforme")],
    ["Valor da falta líquida (R$)", somaL(liquidas, "valor_falta_liquida")],
  ];
  const wsResumo = XLSX.utils.aoa_to_sheet(resumo);
  for (let r = 4; r <= 9; r++) { const c = wsResumo[XLSX.utils.encode_cell({ r, c: 1 })]; if (c) c.z = FMT_Q; }
  const cv = wsResumo[XLSX.utils.encode_cell({ r: 10, c: 1 })]; if (cv) cv.z = FMT_R;
  wsResumo["!cols"] = [{ wch: 30 }, { wch: 34 }];

  // Divergências: visão líquida por SKU
  const cabL = [
    "Cód. cadastro", "SKU", "Produto", "NFs", "Qtd NF (kits)", "Recebido (kits)", "Recebido sem NF (kits)",
    "Falta líquida (kits)", "Excesso líquido (kits)", "Não conforme (kits)", "Preço unit. NF (R$)", "Valor falta líquida (R$)", "Situação",
  ];
  const divL = liquidas.filter(temDivergenciaLiquida);
  const wsDiv = XLSX.utils.aoa_to_sheet([
    cabL,
    ...divL.map((l) => [
      l.cod_cadastro ?? "", l.sku ?? "", l.nome_comercial ?? "", l.nfs ?? "",
      n(l.qtd_nf), n(l.qtd_recebida), n(l.qtd_recebida_sem_nf), n(l.falta_liquida), n(l.excesso_liquido),
      n(l.qtd_nao_conforme), n(l.preco_unit_nf), n(l.valor_falta_liquida), l.situacao ?? "",
    ]),
    ["TOTAL", "", "", "", somaL(divL, "qtd_nf"), somaL(divL, "qtd_recebida"), somaL(divL, "qtd_recebida_sem_nf"),
      somaL(divL, "falta_liquida"), somaL(divL, "excesso_liquido"), somaL(divL, "qtd_nao_conforme"), "", somaL(divL, "valor_falta_liquida"), ""],
  ]);
  aplicarFormatos(wsDiv, [4, 5, 6, 7, 8, 9], [10, 11], [16, 20, 40, 24, 14, 16, 20, 18, 20, 18, 18, 22, 24]);

  // Conferência completa: visão por NF (auditoria), sem mudança
  const cab = [
    "NF", "Cód. cadastro", "SKU", "Produto", "Qtd NF (kits)", "Recebido (kits)", "Falta (kits)", "Excesso (kits)",
    "Não conforme (kits)", "Preço unit. NF (R$)", "Valor falta (R$)", "Classificação",
  ];
  const wsConf = XLSX.utils.aoa_to_sheet([
    cab,
    ...linhas.map((l) => [
      l.nf_numero ?? "", l.cod_cadastro ?? "", l.sku ?? "", l.nome_comercial ?? "",
      n(l.qtd_nf), n(l.qtd_recebida), n(l.qtd_falta), n(l.qtd_excesso), n(l.qtd_nao_conforme),
      n(l.preco_unit_nf), n(l.valor_falta), l.classificacao ?? "",
    ]),
    ["TOTAL", "", "", "", soma(linhas, "qtd_nf"), soma(linhas, "qtd_recebida"), soma(linhas, "qtd_falta"), soma(linhas, "qtd_excesso"),
      soma(linhas, "qtd_nao_conforme"), "", soma(linhas, "valor_falta"), ""],
  ]);
  aplicarFormatos(wsConf, [4, 5, 6, 7, 8], [9, 10], [14, 16, 20, 40, 14, 16, 12, 14, 18, 18, 16, 28]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");
  XLSX.utils.book_append_sheet(wb, wsDiv, "Divergências");
  XLSX.utils.book_append_sheet(wb, wsConf, "Conferência completa");
  XLSX.writeFile(wb, `Divergencia_${numeroPedido}_${iso}.xlsx`);
}
