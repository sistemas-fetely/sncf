import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FaseEntrega = "entregue" | "em_transito" | "atencao" | "sem_conhecimento";

/** Linha de `vw_logistica_entrega_custo` — visão única de rastreio + custo do CT-e. */
export interface EntregaCustoRow {
  rastreio_id: string | null;
  transportadora_id: string | null;
  nf_numero: string | null;
  nf_serie: string | null;
  chave_nfe: string | null;
  pedido_id: string | null;
  pedido_ref: string | null;
  cte_numero: string | null;
  destinatario: string | null;
  cidade_destino: string | null;
  uf_destino: string | null;
  valor_nf: number | null;
  origem_dado: string | null;
  status_transportadora: string | null;
  tipo_frete: string | null;
  previsao_entrega: string | null;
  data_entrega: string | null;
  recebedor: string | null;
  ocorrencia_ativa: string | null;
  ocorrencia_codigo: string | null;
  ocorrencia_data: string | null;
  ultimo_evento_descricao: string | null;
  ultimo_evento_em: string | null;
  divergencia_cabecalho_timeline: boolean | null;
  timeline_json: unknown;
  sync_erro: string | null;
  atualizado_em: string | null;
  frete_id: string | null;
  cte_emissao: string | null;
  cte_serie: string | null;
  minuta: string | null;
  volumes: number | null;
  peso_real: number | null;
  peso_taxado: number | null;
  frete_total: number | null;
  frete_peso: number | null;
  gris: number | null;
  ad_valorem: number | null;
  itr: number | null;
  tde: number | null;
  valor_pedagio: number | null;
  valor_imposto: number | null;
  valor_redespacho: number | null;
  valor_coleta: number | null;
  valor_entrega: number | null;
  pct_frete_nf: number | null;
  importado_arquivo: string | null;
  custo_pendente: boolean | null;
  fase_entrega: FaseEntrega | string | null;
  motivo_atencao: string | null;
}

/** Evento normalizado da timeline crua (`timeline_json`). */
export interface EventoTimeline {
  descricao: string | null;
  data: string | null;
  local: string | null;
}

export function normalizarTimeline(bruto: unknown): EventoTimeline[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.map((item) => {
    const ev = (item ?? {}) as Record<string, unknown>;
    const str = (v: unknown) =>
      typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
    return {
      descricao:
        str(ev.descricao) ?? str(ev.ocorrencia) ?? str(ev.evento) ?? str(ev.status) ?? null,
      data: str(ev.data) ?? str(ev.data_hora) ?? str(ev.dataHora) ?? str(ev.data_ocorrencia) ?? null,
      local: str(ev.local) ?? str(ev.cidade) ?? str(ev.filial) ?? null,
    };
  });
}

export function useEntregasTransportadora(transportadoraId: string | null) {
  return useQuery({
    queryKey: ["logistica", "entregas-custo", transportadoraId],
    queryFn: async (): Promise<EntregaCustoRow[]> => {
      if (!transportadoraId) return [];
      const { data, error } = await supabase
        .from("vw_logistica_entrega_custo")
        .select("*")
        .eq("transportadora_id", transportadoraId)
        .order("atualizado_em", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as EntregaCustoRow[];
    },
    enabled: !!transportadoraId,
  });
}
