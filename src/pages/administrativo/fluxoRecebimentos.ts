// Agrupamento puro do Fluxo de Recebimentos (sem React, testável).

export type Granularidade = "dia" | "semana" | "mes";

export interface Recebivel {
  origem_id: string;
  origem: string;
  numero_titulo: string | null;
  pedido_id: string | null;
  cliente: string | null;
  canal: string | null;
  qualidade: string | null;
  eh_firme: boolean | null;
  data_vencimento_atual: string | null;
  dia_credito: string | null;
  regra_data: string | null;
  eh_atrasado: boolean | null;
  dias_atraso: number | null;
  valor_liquido: number | null;
  valor_bruto: number | null;
  taxa_ausente: boolean | null;
  instrumento: string | null;
}

export interface Periodo {
  chave: string;
  rotulo: string;
  porCanal: Record<string, number>;
  firmePorCanal: Record<string, number>;
  firme: number;
  incerto: number;
  total: number;
  acumulado: number;
  itens: Recebivel[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** ISO yyyy-mm-dd -> Date UTC (evita fuso). */
export function parseIso(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function toIso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
export function addDias(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}
export function ddmm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** Segunda-feira da semana do dia. */
export function inicioSemana(iso: string): string {
  const dow = parseIso(iso).getUTCDay(); // 0 = dom
  return addDias(iso, -((dow + 6) % 7));
}

export function chavePeriodo(iso: string, g: Granularidade): string {
  if (g === "dia") return iso.slice(0, 10);
  if (g === "semana") return inicioSemana(iso);
  return iso.slice(0, 7);
}

export function rotuloPeriodo(chave: string, g: Granularidade): string {
  if (g === "dia") return ddmm(chave);
  if (g === "semana") return `${ddmm(chave)} – ${ddmm(addDias(chave, 6))}`;
  return `${MESES[Number(chave.slice(5, 7)) - 1]}/${chave.slice(2, 4)}`;
}

export const canalDe = (r: Recebivel) => r.canal || "Sem canal";
export const valor = (r: Recebivel) => Number(r.valor_liquido ?? 0);

/** Não atrasados com crédito em [hoje, hoje+dias]. */
export function noHorizonte(rs: Recebivel[], hoje: string, dias: number): Recebivel[] {
  const fim = addDias(hoje, dias);
  return rs.filter((r) => !r.eh_atrasado && r.dia_credito && r.dia_credito >= hoje && r.dia_credito <= fim);
}

export function somar(rs: Recebivel[]) {
  let total = 0, firme = 0;
  for (const r of rs) {
    total += valor(r);
    if (r.eh_firme) firme += valor(r);
  }
  return { total, firme };
}

/** Agrupa (já filtrados, sem atrasados) por período em ordem cronológica, com acumulado. */
export function agruparPeriodos(rs: Recebivel[], g: Granularidade): Periodo[] {
  const mapa = new Map<string, Periodo>();
  for (const r of rs) {
    if (r.eh_atrasado || !r.dia_credito) continue;
    const chave = chavePeriodo(r.dia_credito, g);
    let p = mapa.get(chave);
    if (!p) {
      p = { chave, rotulo: rotuloPeriodo(chave, g), porCanal: {}, firmePorCanal: {}, firme: 0, incerto: 0, total: 0, acumulado: 0, itens: [] };
      mapa.set(chave, p);
    }
    const c = canalDe(r);
    const v = valor(r);
    p.porCanal[c] = (p.porCanal[c] ?? 0) + v;
    if (r.eh_firme) {
      p.firme += v;
      p.firmePorCanal[c] = (p.firmePorCanal[c] ?? 0) + v;
    } else p.incerto += v;
    p.total += v;
    p.itens.push(r);
  }
  const lista = [...mapa.values()].sort((a, b) => a.chave.localeCompare(b.chave));
  let acc = 0;
  for (const p of lista) {
    acc += p.total;
    p.acumulado = acc;
    p.itens.sort((a, b) => (a.dia_credito ?? "").localeCompare(b.dia_credito ?? ""));
  }
  return lista;
}
