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

export function baixarRelatorioDivergencia(linhas: LinhaDivergencia[]) {
  if (!linhas.length) throw new Error("Sem linhas de conferência para este pedido.");
  const numeroPedido = linhas[0].numero_pedido ?? "pedido";
  const fornecedor = linhas[0].fornecedor ?? "";
  const hoje = new Date();
  const iso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;

  // Resumo: uma linha por NF (+ termo)
  const grupos = new Map<string, LinhaDivergencia[]>();
  for (const l of linhas) {
    const k = `${l.nf_numero ?? ""}|${l.termos ?? ""}|${l.data_termo ?? ""}`;
    grupos.set(k, [...(grupos.get(k) ?? []), l]);
  }
  const soma = (ls: LinhaDivergencia[], f: keyof LinhaDivergencia) => ls.reduce((a, l) => a + n(l[f]), 0);
  const resumo: (string | number)[][] = [
    ["Fornecedor", fornecedor],
    ["Pedido", numeroPedido],
    ["Gerado em", dataBr(iso)],
    [],
    ["NF", "Emissão", "Termo", "Data do termo", "Qtd NF (kits)", "Recebido (kits)", "Falta (kits)", "Excesso (kits)", "Valor da falta (R$)"],
  ];
  const inicioTabela = resumo.length;
  for (const ls of grupos.values()) {
    const p = ls[0];
    resumo.push([
      p.nf_numero ?? "", dataBr(p.nf_data_emissao), p.termos ?? "", dataBr(p.data_termo),
      soma(ls, "qtd_nf"), soma(ls, "qtd_recebida"), soma(ls, "qtd_falta"), soma(ls, "qtd_excesso"), soma(ls, "valor_falta"),
    ]);
  }
  resumo.push([
    "TOTAL", "", "", "",
    soma(linhas, "qtd_nf"), soma(linhas, "qtd_recebida"), soma(linhas, "qtd_falta"), soma(linhas, "qtd_excesso"), soma(linhas, "valor_falta"),
  ]);
  const wsResumo = XLSX.utils.aoa_to_sheet(resumo);
  aplicarFormatos(wsResumo, [4, 5, 6, 7], [8], [34, 12, 18, 14, 14, 16, 12, 14, 20]);
  void inicioTabela;

  const cab = [
    "NF", "Cód. cadastro", "SKU", "Produto", "Qtd NF (kits)", "Recebido (kits)", "Falta (kits)", "Excesso (kits)",
    "Não conforme (kits)", "Preço unit. NF (R$)", "Valor falta (R$)", "Classificação",
  ];
  const linhaDe = (l: LinhaDivergencia) => [
    l.nf_numero ?? "", l.cod_cadastro ?? "", l.sku ?? "", l.nome_comercial ?? "",
    n(l.qtd_nf), n(l.qtd_recebida), n(l.qtd_falta), n(l.qtd_excesso), n(l.qtd_nao_conforme),
    n(l.preco_unit_nf), n(l.valor_falta), l.classificacao ?? "",
  ];
  const totalDe = (ls: LinhaDivergencia[]) => [
    "TOTAL", "", "", "", soma(ls, "qtd_nf"), soma(ls, "qtd_recebida"), soma(ls, "qtd_falta"), soma(ls, "qtd_excesso"),
    soma(ls, "qtd_nao_conforme"), "", soma(ls, "valor_falta"), "",
  ];
  const montar = (ls: LinhaDivergencia[]) => {
    const ws = XLSX.utils.aoa_to_sheet([cab, ...ls.map(linhaDe), totalDe(ls)]);
    aplicarFormatos(ws, [4, 5, 6, 7, 8], [9, 10], [14, 16, 20, 40, 14, 16, 12, 14, 18, 18, 16, 28]);
    return ws;
  };
  const div = linhas.filter(temDivergencia);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");
  XLSX.utils.book_append_sheet(wb, montar(div), "Divergências");
  XLSX.utils.book_append_sheet(wb, montar(linhas), "Conferência completa");
  XLSX.writeFile(wb, `Divergencia_${numeroPedido}_${iso}.xlsx`);
}
