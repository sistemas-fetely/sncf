import type { RemessaRow } from "@/hooks/logistica/useLogisticaRemessas";

export type LinhaPeriodo = Pick<RemessaRow, "grao" | "entregue_em" | "dias_entrega" | "no_prazo" | "dias_atraso" | "reentregas" | "estado_canonico" | "uf_destino" | "canal" | "data_despacho">;
export interface ResumoPeriodo {
  remessas: number; entregues: number; prazoMedio: number | null;
  comPrevisao: number; noPrazo: number; pctNoPrazo: number | null;
  atrasadas: number; atrasoMedio: number | null; reentregas: number; devolucoes: number;
}
export interface GrupoPeriodo extends ResumoPeriodo { chave: string }
const media = (valores: (number | null)[]) => {
  const numeros = valores.filter((v): v is number => v != null && Number.isFinite(v));
  return numeros.length ? numeros.reduce((s, v) => s + v, 0) / numeros.length : null;
};
export function resumirPeriodo(linhas: readonly LinhaPeriodo[]): ResumoPeriodo {
  const pedidos = linhas.filter(r => r.grao === "pedido");
  const entregues = pedidos.filter(r => Boolean(r.entregue_em));
  const mensuraveis = pedidos.filter(r => r.no_prazo != null);
  const noPrazo = mensuraveis.filter(r => r.no_prazo === true).length;
  const atrasadas = entregues.filter(r => r.no_prazo === false);
  return {
    remessas: pedidos.length, entregues: entregues.length,
    prazoMedio: media(entregues.map(r => r.dias_entrega)),
    comPrevisao: mensuraveis.length, noPrazo,
    pctNoPrazo: mensuraveis.length ? noPrazo / mensuraveis.length * 100 : null,
    atrasadas: atrasadas.length, atrasoMedio: media(atrasadas.map(r => r.dias_atraso)),
    reentregas: pedidos.reduce((s, r) => s + (r.reentregas ?? 0), 0),
    devolucoes: pedidos.filter(r => r.estado_canonico === "devolucao").length,
  };
}
export function segundaDoDespacho(data: string | null): string | null {
  if (!data) return null;
  const d = new Date(`${data.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
}
export function agruparPeriodo(linhas: readonly LinhaPeriodo[], campo: "uf_destino" | "canal" | "semana"): GrupoPeriodo[] {
  const grupos = new Map<string, LinhaPeriodo[]>();
  for (const r of linhas) {
    if (r.grao !== "pedido") continue;
    const chave = campo === "semana" ? segundaDoDespacho(r.data_despacho) : r[campo] ?? "—";
    if (chave == null) continue;
    const grupo = grupos.get(chave) ?? [];
    grupo.push(r); grupos.set(chave, grupo);
  }
  return [...grupos].map(([chave, itens]) => ({ chave, ...resumirPeriodo(itens) }))
    .sort((a, b) => campo === "semana" ? a.chave.localeCompare(b.chave) : b.remessas - a.remessas || a.chave.localeCompare(b.chave));
}
export function maioresAtrasos<T extends LinhaPeriodo>(linhas: readonly T[]): T[] {
  return linhas.filter(r => r.grao === "pedido" && Boolean(r.entregue_em) && (r.dias_atraso ?? 0) > 0)
    .sort((a, b) => (b.dias_atraso ?? 0) - (a.dias_atraso ?? 0)).slice(0, 5);
}
export function filtrarUfPeriodo<T extends Pick<LinhaPeriodo, "uf_destino">>(linhas: readonly T[], uf: string | null): T[] {
  return linhas.filter(r => uf == null || (r.uf_destino ?? "—") === uf);
}
export const alertaNoPrazo = (pct: number | null) => pct != null && pct < 80;
export const alertaDevolucoes = (total: number) => total > 0;
export function analisarPeriodo<T extends LinhaPeriodo>(linhas: readonly T[]) {
  return { resumo: resumirPeriodo(linhas), semanas: agruparPeriodo(linhas, "semana"),
    destinos: agruparPeriodo(linhas, "uf_destino"), canais: agruparPeriodo(linhas, "canal"), atrasos: maioresAtrasos(linhas) };
}