import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StatusOperacional = "entregue" | "terminal" | "atencao" | "em_transito";

export interface FreteRow {
  id: string;
  transportadora_id: string;
  data_frete: string | null;
  tipo_frete: string | null;
  minuta: string | null;
  cte_numero: string | null;
  cte_serie: string | null;
  cte_emissao: string | null;
  nf_numero: string | null;
  referencia: string | null;
  doc_anterior: string | null;
  di_dta: string | null;
  hawb: string | null;
  mawb: string | null;
  remetente: string | null;
  remetente_cidade: string | null;
  remetente_uf: string | null;
  destinatario: string | null;
  destinatario_cidade: string | null;
  destinatario_uf: string | null;
  volumes: number | null;
  peso_real: number | null;
  peso_taxado: number | null;
  valor_nf: number | null;
  frete_total: number | null;
  frete_peso: number | null;
  valor_coleta: number | null;
  valor_entrega: number | null;
  ad_valorem: number | null;
  valor_redespacho: number | null;
  gris: number | null;
  itr: number | null;
  tde: number | null;
  valor_despacho: number | null;
  sec_cat: number | null;
  adicionais: number | null;
  outros_valores: number | null;
  valor_pedagio: number | null;
  valor_imposto: number | null;
  prazo_entrega: string | null;
  ocorrencia_texto: string | null;
  ocorrencia_data: string | null;
  ocorrencia_codigo: string | null;
  ocorrencia_label: string | null;
  classe: "entregue" | "em_transito" | "coletado" | "atencao" | string | null;
  eh_problema: boolean | null;
  eh_terminal: boolean | null;
  ordem_urgencia: number | null;
  pct_frete_nf: number | null;
  importado_arquivo: string | null;
  importado_em: string | null;
  atualizado_em: string | null;
  // Enriched from vw_logistica_frete_status:
  status_operacional: StatusOperacional | null;
  entrega_confirmada_em: string | null;
  fonte_entrega: string | null;
  resgatado_por_outra_fonte: boolean | null;
  ocorrencia_classe: string | null;
  ocorrencia_ruido_texto: string | null;
  ocorrencia_ruido_data: string | null;
}

export function useFretesTransportadora(transportadoraId: string | null) {
  return useQuery({
    queryKey: ["logistica", "fretes", transportadoraId],
    queryFn: async (): Promise<FreteRow[]> => {
      if (!transportadoraId) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const [fretesRes, statusRes] = await Promise.all([
        sb
          .from("vw_transp_fretes")
          .select("*")
          .eq("transportadora_id", transportadoraId)
          .order("ordem_urgencia", { ascending: true, nullsFirst: false })
          .order("prazo_entrega", { ascending: true, nullsFirst: false }),
        sb
          .from("vw_logistica_frete_status")
          .select("frete_id,status_operacional,entrega_confirmada_em,fonte_entrega,resgatado_por_outra_fonte,ocorrencia_classe,ocorrencia_ruido_texto,ocorrencia_ruido_data"),
      ]);
      if (fretesRes.error) throw fretesRes.error;
      if (statusRes.error) throw statusRes.error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const statusMap = new Map<string, any>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const s of (statusRes.data ?? []) as any[]) {
        statusMap.set(s.frete_id, s);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((fretesRes.data ?? []) as any[]).map((f) => {
        const s = statusMap.get(f.id);
        return {
          ...f,
          status_operacional: (s?.status_operacional ?? null) as StatusOperacional | null,
          entrega_confirmada_em: s?.entrega_confirmada_em ?? null,
          fonte_entrega: s?.fonte_entrega ?? null,
          resgatado_por_outra_fonte: s?.resgatado_por_outra_fonte ?? null,
          ocorrencia_classe: s?.ocorrencia_classe ?? null,
          ocorrencia_ruido_texto: s?.ocorrencia_ruido_texto ?? null,
          ocorrencia_ruido_data: s?.ocorrencia_ruido_data ?? null,
        } as FreteRow;
      });
    },
    enabled: !!transportadoraId,
  });
}
