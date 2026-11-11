export type SituacaoAndamento = "ocorrencia" | "atrasada" | "parada" | "sem_rastreio" | "em_transito";
type Sinais = {
  eh_problema: boolean | null; atrasada: boolean | null; parada: boolean | null; tem_rastreio: boolean | null;
  dias_atraso: number | null; data_despacho: string | null;
};
export const PRIORIDADE_ANDAMENTO: SituacaoAndamento[] = ["ocorrencia", "atrasada", "parada", "sem_rastreio", "em_transito"];
export function situacaoAndamento(r: Sinais): SituacaoAndamento {
  if (r.eh_problema === true) return "ocorrencia";
  if (r.atrasada === true) return "atrasada";
  if (r.parada === true) return "parada";
  if (r.tem_rastreio === false) return "sem_rastreio";
  return "em_transito";
}
export function compararAndamento(a: Sinais, b: Sinais): number {
  const prioridade = PRIORIDADE_ANDAMENTO.indexOf(situacaoAndamento(a)) - PRIORIDADE_ANDAMENTO.indexOf(situacaoAndamento(b));
  if (prioridade) return prioridade;
  const atraso = (b.dias_atraso ?? 0) - (a.dias_atraso ?? 0);
  if (atraso) return atraso;
  if (a.data_despacho == null && b.data_despacho == null) return 0;
  if (a.data_despacho == null) return 1;
  if (b.data_despacho == null) return -1;
  return a.data_despacho.localeCompare(b.data_despacho);
}