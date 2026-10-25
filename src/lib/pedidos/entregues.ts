/** PEDIDOS SITE SP · entregues escondidos por padrão (25/10/2026). */
/**
 * Regra do toggle "Mostrar entregues": desligado, um pedido com estágio
 * `entregue` sai da lista — exceto quando há termo de busca preenchido
 * (a busca deve achar entregue) ou quando o filtro ativo aponta para
 * entregues (card "Entregue · 30 dias" / etapa da fase entregue).
 */
export function esconderEntreguesNaLista(o: {
  mostrarEntregues: boolean;
  temBusca: boolean;
  filtroDeEntregue: boolean;
}): boolean {
  return !o.mostrarEntregues && !o.temBusca && !o.filtroDeEntregue;
}
