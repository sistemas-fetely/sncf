/** API v3 /pedidos/vendas: dataAlteracaoInicial, datetime YYYY-MM-DD HH:MM:SS.
 * Official OpenAPI: https://developer.bling.com.br/referencia (12/11/2026).
 * Both change-date bounds are optional; no final bound is needed.
 */
export function filtroAlteracaoPedidos(corte: string | null): string {
  if (!corte) return "";
  const data = new Date(corte);
  if (Number.isNaN(data.getTime())) throw new Error(`Cursor de pedidos com data inválida: ${corte}`);
  const inicio = new Date(data.getTime() - 86_400_000).toISOString().slice(0, 19).replace("T", " ");
  return `&dataAlteracaoInicial=${encodeURIComponent(inicio)}`;
}