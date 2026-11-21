export interface EstadoRessarcimentoExtrato {
  desfecho: string | null; status: string | null; status_efetivo?: string | null;
  e6_ressarcida: boolean | null; e7_encerrada?: boolean | null; ressarcimento_mov_id?: string | null;
}

export function mostrarRessarcimentoExtrato(d: EstadoRessarcimentoExtrato): boolean {
  if (d.ressarcimento_mov_id != null) return true;
  return d.desfecho === "reembolso" && d.e6_ressarcida === false && d.e7_encerrada !== true
    && !["encerrada", "cancelada"].includes(d.status_efetivo ?? d.status ?? "");
}

export interface ResultadoRessarcimento {
  ok: boolean; erro?: string; diferenca?: number; encerramento?: { encerrou: boolean; pendencias: string[] };
}

export function validarResultadoRessarcimento(data: unknown): ResultadoRessarcimento {
  const r = data as ResultadoRessarcimento | null;
  if (!r || r.ok !== true) throw new Error(r?.erro ?? "O banco recusou a operação.");
  return r;
}