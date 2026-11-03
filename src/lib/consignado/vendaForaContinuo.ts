export interface EstoqueVendaFora {
  sku: string | null; produto: string | null; ean: string | null;
  qtd_sncf: number | null; qtd_plataforma: number | null;
  qtd_plataforma_loja: number | null; qtd_plataforma_transito: number | null;
  diferenca: number | null; valor_custo_sncf: number | null; data_foto_plataforma: string | null;
}
export interface CompetenciaVendaFora {
  competencia: string; unidades: number | null; receita_bruta: number | null;
  retido_plataforma: number | null; mdr: number | null; liquido_recebido: number | null;
  aluguel_a_pagar: number | null; aluguel_status: string | null;
  aluguel_vencimento: string | null; aluguel_alerta: string | null;
}
export interface LancamentosMes {
  competencia: string; receita: number;
  lancamentos: { tipo: string; valor: number; acao: string; anterior: number | null; status_conta: string | null }[];
}
export function resumirVendaFora(estoque: EstoqueVendaFora[], competencias: CompetenciaVendaFora[], recebiveis: { situacao: string; valor_a_liquidar: number | null }[], hoje: string) {
  return {
    unidades: estoque.reduce((s, r) => s + Number(r.qtd_sncf ?? 0), 0),
    custo: estoque.reduce((s, r) => s + Number(r.valor_custo_sncf ?? 0), 0),
    divergencias: new Set(estoque.filter(r => Number(r.diferenca ?? 0) !== 0).map(r => r.sku)).size,
    mes: competencias.find(r => r.competencia.slice(0, 7) === hoje.slice(0, 7)),
    receber: recebiveis.filter(r => r.situacao !== "liquidado").reduce((s, r) => s + Number(r.valor_a_liquidar ?? 0), 0),
    aluguel: competencias.filter(r => r.aluguel_status === "aberto").sort((a, b) => a.competencia.localeCompare(b.competencia))[0],
  };
}
export function filtrarEstoqueVendaFora(rows: EstoqueVendaFora[], busca: string, divergencias: boolean) {
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  return rows.filter(r => (!divergencias || Number(r.diferenca ?? 0) !== 0) && `${r.sku ?? ""} ${r.produto ?? ""} ${r.ean ?? ""}`.toLocaleLowerCase("pt-BR").includes(termo));
}