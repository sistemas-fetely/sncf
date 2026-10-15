import type { TransportadoraLogistica } from "@/hooks/logistica/useTransportadorasLogistica";

export type EscopoLogisticaValor =
  | { tipo: "canal"; valor: "total" | "b2b" | "b2c" }
  | { tipo: "transportadora"; valor: string };

export function nomeCurtoTransportadora(t: TransportadoraLogistica): string {
  return t.nome_fantasia?.trim() || t.razao_social;
}

export function parametrosEscopo(params: URLSearchParams, escopo: EscopoLogisticaValor): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete("canal");
  next.delete("transportadora");
  if (escopo.tipo === "transportadora") next.set("transportadora", escopo.valor);
  else if (escopo.valor !== "total") next.set("canal", escopo.valor);
  return next;
}