/** The board's current modal wins; packaging is only a null fallback. */
export function modalDespachoMesa(pedido: { modal_efetivo?: string | null }, modalEmbalagem: string | null): string | null {
  return pedido.modal_efetivo ?? modalEmbalagem;
}

/** Adds invoiced B2B postal boxes without changing the board's order source. */
export function pedidosColetaMesa<T extends { id: string; canal: string; postagem_bloqueada?: boolean | null }>(
  prontosDespacho: T[],
  nfEmitida: T[],
  modalDoPedido: (pedidoId: string) => string | null,
  modais: { codigo: string; exige_etiqueta_correios: boolean }[],
  cancelados: { has: (pedidoId: string) => boolean },
): T[] {
  const postais = new Set(modais.filter((modal) => modal.exige_etiqueta_correios).map((modal) => modal.codigo));
  const adicionais = nfEmitida.filter((pedido) => pedido.canal.toUpperCase() === "B2B" && postais.has(modalDoPedido(pedido.id) ?? ""));
  return [...new Map([...prontosDespacho, ...adicionais]
    .filter((pedido) => !cancelados.has(pedido.id) && !pedido.postagem_bloqueada)
    .map((pedido) => [pedido.id, pedido])).values()];
}