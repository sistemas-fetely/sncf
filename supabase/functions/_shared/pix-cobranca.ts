export function ehCodigoPix(valor?: string | null): boolean {
  return (valor ?? "").trim().startsWith("000201");
}
export function ehLinkPix(tipo?: string | null, valor?: string | null): boolean {
  return (tipo ?? "").toLowerCase() === "pix" && /^https?:\/\//i.test((valor ?? "").trim());
}