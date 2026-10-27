/** Detalhamento da quantidade contábil de um SKU×centro no Cockpit do Estoque.
 *
 *  A view `vw_estoque_cockpit` traz, por SKU×centro:
 *  - `fiscal_sadio` → vendável (o que "vende");
 *  - `a_caminho`    → transferência com NF autorizada aguardando conferência de chegada.
 *  O resto (contabil − fiscal_sadio − a_caminho) é bloqueado (avaria/quarentena).
 */
export interface DetalheQtd {
  sadio: number;
  caminho: number;
  bloqueado: number;
}

export const DETALHE_ZERO: DetalheQtd = { sadio: 0, caminho: 0, bloqueado: 0 };

const num = (v: number | null | undefined) => Number(v ?? 0);
const fmt = (v: number) => new Intl.NumberFormat("pt-BR").format(v);

/**
 * Sadio e a caminho vêm da view; bloqueado é a sobra contábil.
 * A sobra nunca é negativa: se as duas condições explicam mais que o total,
 * não há avaria a mostrar.
 */
export function detalheQtd(
  contabil: number | null,
  sadio: number | null,
  caminho: number | null,
): DetalheQtd {
  const s = num(sadio);
  const c = num(caminho);
  return { sadio: s, caminho: c, bloqueado: Math.max(0, num(contabil) - s - c) };
}

export function somarDetalhe(a: DetalheQtd, b: DetalheQtd): DetalheQtd {
  return { sadio: a.sadio + b.sadio, caminho: a.caminho + b.caminho, bloqueado: a.bloqueado + b.bloqueado };
}

/** Há algo fora do sadio (a caminho ou bloqueado)? */
export function temDesvio(d: DetalheQtd): boolean {
  return d.caminho > 0 || d.bloqueado > 0;
}

/** Partes do detalhamento, só o que é maior que zero. `curto` encurta "bloqueado" para caber na célula. */
export function detalhePartes(d: DetalheQtd, curto = false): string[] {
  const partes: string[] = [];
  if (d.caminho > 0) partes.push(`${fmt(d.caminho)} a caminho`);
  if (d.bloqueado > 0) partes.push(`${fmt(d.bloqueado)} ${curto ? "bloq." : "bloqueado"}`);
  return partes;
}

export function tooltipDetalhe(d: DetalheQtd): string {
  return `Sadio ${fmt(d.sadio)} · A caminho ${fmt(d.caminho)} · Bloqueado ${fmt(d.bloqueado)}`;
}
