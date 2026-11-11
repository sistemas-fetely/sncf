export type Campo = { campo: string; origem: string; destino: string; tipo: "numero" | "texto" | "digitos"; divisor?: number };
export type Diferenca = { campo: string; destino: string; valor_sncf: unknown; valor_bling: unknown };
const DESTINOS = new Set(["pesoBruto", "pesoLiquido", "dimensoes.altura", "dimensoes.largura", "dimensoes.profundidade", "dimensoes.unidadeMedida", "gtin", "gtinEmbalagem", "tributacao.ncm", "tributacao.cest", "marca", "itensPorCaixa"]);
export function ler(obj: Record<string, any>, path: string): unknown { return path.split(".").reduce((o, k) => o?.[k], obj); }
export function valor(v: unknown, c: Campo): unknown {
  if (v == null || String(v).trim() === "" || Number(v) === 0) return null;
  if (c.tipo === "numero") { const n = Number(v); return Number.isFinite(n) && n > 0 ? n / (c.divisor ?? 1) : null; }
  return c.tipo === "digitos" ? String(v).replace(/\D/g, "") || null : String(v).trim();
}
export function comparar(fonte: Record<string, any>, bling: Record<string, any>, campos: Campo[]): Diferenca[] {
  const diferencas = campos.flatMap((c) => {
    if (!DESTINOS.has(c.destino)) throw new Error(`Campo fora da Fase 1: ${c.destino}`);
    if (c.destino === "itensPorCaixa") {
      if (c.origem !== "inner_qtd") throw new Error("itensPorCaixa exige origem inner_qtd; múltiplo comercial nunca pode ser enviado.");
      if (fonte.inner_confirmado !== true) return [];
    }
    const sncf = valor(fonte[c.origem], c); if (sncf == null) return [];
    const bruto = ler(bling, c.destino) ?? null;
    let atual = c.tipo === "numero" ? Number(bruto) : c.tipo === "digitos" ? String(bruto ?? "").replace(/\D/g, "") : String(bruto ?? "").trim();
    const igual = c.tipo === "numero" ? Math.abs(Number(sncf) - Number(atual)) <= 0.001 + Number.EPSILON : sncf === atual;
    return igual ? [] : [{ campo: c.campo, destino: c.destino, valor_sncf: sncf, valor_bling: bruto }];
  });
  const temDimensao = campos.some((c) => c.destino.startsWith("dimensoes.") && c.destino !== "dimensoes.unidadeMedida" && valor(fonte[c.origem], c) != null);
  if (temDimensao && Number(bling.dimensoes?.unidadeMedida) !== 1) {
    diferencas.push({ campo: "unidadeMedida", destino: "dimensoes.unidadeMedida", valor_sncf: 1, valor_bling: bling.dimensoes?.unidadeMedida ?? null });
  }
  return diferencas;
}
export type FiltroAplicacao = { skus?: string[]; campos?: string[] };
export function dentroDoFiltro(item: { sku: string; campo: string }, filtro: FiltroAplicacao): boolean {
  return (filtro.skus === undefined || filtro.skus.includes(item.sku)) && (filtro.campos === undefined || filtro.campos.includes(item.campo));
}
export function confirmarCodigo(atual: Record<string, any> | null, codigo: string, id: unknown): void {
  if (!atual?.id || String(atual.id) !== String(id) || String(atual.codigo ?? "") !== codigo) throw new Error(`Vínculo Bling mudou: esperado ${codigo} (${id}); refaça a comparação.`);
}
export function montarPatch(itens: Diferenca[], fonte: Record<string, any> = {}): Record<string, any> {
  const patch: Record<string, any> = {};
  for (const i of itens) {
    if (!DESTINOS.has(i.destino)) throw new Error(`Campo fora da Fase 1: ${i.destino}`);
    if (i.valor_sncf == null || String(i.valor_sncf).trim() === "" || Number(i.valor_sncf) === 0) continue;
    const [grupo, campo] = i.destino.split(".");
    if (campo) { patch[grupo] ??= {}; patch[grupo][campo] = i.valor_sncf; }
    else patch[grupo] = i.valor_sncf;
  }
  if (patch.dimensoes) {
    const dimensoes: Record<string, number> = { unidadeMedida: 1 };
    for (const campo of ["altura", "largura", "profundidade"]) {
      const medida = Number(fonte[`${campo}_cm`]);
      if (!Number.isFinite(medida) || medida <= 0) throw new Error(`Dimensão SNCF inválida: ${campo}_cm; nenhum PATCH seguro pode ser montado.`);
      dimensoes[campo] = medida;
    }
    patch.dimensoes = dimensoes;
  }
  return patch;
}
export function exigirEscrita(config: { escrita_habilitada: boolean }) { if (!config.escrita_habilitada) throw new Error("Envio ao Bling desligado na configuração. Nenhum produto foi enviado."); }