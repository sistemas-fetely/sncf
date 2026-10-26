/** Normaliza o número digitado em candidatos de `pedidos.id_externo`. */
export function normalizarNumeroPedido(entrada: string): string[] {
  const s = (entrada ?? "").replace(/\s+/g, "").toUpperCase().replace(/^#/, "");
  if (!s) return [];
  const m = s.match(/^([A-Z]+)-?(\d+)$/);
  if (m) return [`${m[1]}-${m[2]}`];
  if (/^\d+$/.test(s)) return [`SHP-${s}`, `PED-${s}`, `VD-${s}`];
  return [s];
}
