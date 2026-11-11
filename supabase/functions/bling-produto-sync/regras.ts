export type Campo = { campo: string; origem: string; destino: string; tipo: "numero" | "texto" | "digitos"; divisor?: number };
export type Diferenca = { campo: string; destino: string; valor_sncf: unknown; valor_bling: unknown };
const DESTINOS = new Set(["pesoBruto", "pesoLiquido", "dimensoes.altura", "dimensoes.largura", "dimensoes.profundidade", "gtin", "gtinEmbalagem", "tributacao.ncm", "tributacao.cest", "marca", "itensPorCaixa"]);
export function ler(obj: Record<string, any>, path: string): unknown { return path.split(".").reduce((o, k) => o?.[k], obj); }
export function valor(v: unknown, c: Campo): unknown {
  if (v == null || String(v).trim() === "" || Number(v) === 0) return null;
  if (c.tipo === "numero") { const n = Number(v); return Number.isFinite(n) && n > 0 ? n / (c.divisor ?? 1) : null; }
  return c.tipo === "digitos" ? String(v).replace(/\D/g, "") || null : String(v).trim();
}
export function comparar(fonte: Record<string, any>, bling: Record<string, any>, campos: Campo[]): Diferenca[] {
  return campos.flatMap((c) => {
    if (!DESTINOS.has(c.destino)) throw new Error(`Campo fora da Fase 1: ${c.destino}`);
    const sncf = valor(fonte[c.origem], c); if (sncf == null) return [];
    const bruto = ler(bling, c.destino) ?? null;
    let atual = c.tipo === "numero" ? Number(bruto) : c.tipo === "digitos" ? String(bruto ?? "").replace(/\D/g, "") : String(bruto ?? "").trim();
    if (c.destino.startsWith("dimensoes.") && Number(bling.dimensoes?.unidadeMedida) === 2) atual = Number(atual) * 100;
    const igual = c.tipo === "numero" ? Math.abs(Number(sncf) - Number(atual)) <= 0.001 + Number.EPSILON : sncf === atual;
    return igual ? [] : [{ campo: c.campo, destino: c.destino, valor_sncf: sncf, valor_bling: bruto }];
  });
}
export function montarPatch(itens: Diferenca[]): Record<string, any> {
  const patch: Record<string, any> = {};
  for (const i of itens) {
    if (!DESTINOS.has(i.destino)) throw new Error(`Campo fora da Fase 1: ${i.destino}`);
    if (i.valor_sncf == null || String(i.valor_sncf).trim() === "" || Number(i.valor_sncf) === 0) continue;
    const [grupo, campo] = i.destino.split(".");
    if (campo) { patch[grupo] ??= {}; patch[grupo][campo] = i.valor_sncf; }
    else patch[grupo] = i.valor_sncf;
  }
  if (patch.dimensoes) patch.dimensoes.unidadeMedida = 1;
  return patch;
}
export function exigirEscrita(config: { escrita_habilitada: boolean }) { if (!config.escrita_habilitada) throw new Error("Envio ao Bling desligado na configuração. Nenhum produto foi enviado."); }