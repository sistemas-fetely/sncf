export type StatusMarketplace = 'a_liberar' | 'liberado' | 'sem_pedido';
export type RecebivelMarketplace = {
  venda_id: string; conta_rotulo: string; source_id: string; order_id: string | null; pack_id: string | null;
  data_venda: string | null; sku: string | null; descricao_item: string | null;
  valor_bruto: number | null; comissao: number | null; frete: number | null; taxa_financiamento: number | null;
  impostos: number | null; tarifa_total: number | null; valor_liquido: number | null;
  data_liberacao_prevista: string | null; pedido_id: string | null; pedido_ref: string | null;
  movimentacao_id: string | null; data_liberacao: string | null; valor_liberado: number | null; status: StatusMarketplace;
};
export type RecebivelMarketplacePedido = {
  pedido_id: string; pedido_ref: string; vendas: number; mp_bruto: number | null; mp_comissao: number | null;
  mp_frete: number | null; mp_parcelamento: number | null; mp_impostos: number | null; mp_liquido: number | null;
  mp_liberacao_prevista: string | null; mp_liberado_em: string | null; mp_status: StatusMarketplace;
};
export const rotulosStatusMarketplace: Record<StatusMarketplace, string> = {
  a_liberar: 'A liberar', liberado: 'Liberado', sem_pedido: 'Sem pedido',
};
export function dataLiberacaoMarketplace(r: RecebivelMarketplace) {
  return r.status === 'liberado' ? r.data_liberacao : r.data_liberacao_prevista;
}
export function resumoMarketplace(linhas: RecebivelMarketplace[], mes: string) {
  const pendentes = linhas.filter(r => r.status === 'a_liberar');
  return {
    aLiberar: Math.round(pendentes.reduce((s, r) => s + Number(r.valor_liquido ?? 0), 0) * 100) / 100,
    vendas: pendentes.length,
    liberadoMes: Math.round(linhas.filter(r => r.data_liberacao?.slice(0, 7) === mes)
      .reduce((s, r) => s + Number(r.valor_liberado ?? 0), 0) * 100) / 100,
    semPedido: linhas.filter(r => r.status === 'sem_pedido').length,
  };
}
export function estimativaDifere(real: number | null | undefined, estimativa: number | null | undefined) {
  return real != null && estimativa != null && Math.abs(Math.round(Number(real) * 100) - Math.round(Number(estimativa) * 100)) > 5;
}