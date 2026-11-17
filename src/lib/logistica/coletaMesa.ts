/** Adds invoiced B2B postal boxes without changing the board's order source. */
export function pedidosColetaMesa<T extends { id: string; canal: string }>(
  prontosDespacho: T[],
  nfEmitida: T[],
  modalDaEmbalagem: (pedidoId: string) => string | null,
  modais: { codigo: string; exige_etiqueta_correios: boolean }[],
  cancelados: { has: (pedidoId: string) => boolean },
): T[] {
  const postais = new Set(modais.filter((modal) => modal.exige_etiqueta_correios).map((modal) => modal.codigo));
  const adicionais = nfEmitida.filter((pedido) => pedido.canal.toUpperCase() === "B2B" && postais.has(modalDaEmbalagem(pedido.id) ?? ""));
  return [...new Map([...prontosDespacho, ...adicionais]
    .filter((pedido) => !cancelados.has(pedido.id))
    .map((pedido) => [pedido.id, pedido])).values()];
}