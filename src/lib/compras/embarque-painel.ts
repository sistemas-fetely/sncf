import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Leitura compartilhada da view vw_importacao_embarque_painel.
 * Vive fora dos componentes para evitar import circular entre
 * PainelTab (KPIs) e PainelLista (lista única).
 */

export const CHAVE_EMBARQUE_PAINEL = ["vw_importacao_embarque_painel"] as const;

export interface EmbarquePainelRow {
  embarque_id: number;
  ref_rocabella: string;
  status_id: number | null;
  status_codigo: string | null;
  status_ordem: number | null;
  eta: string | null;
  data_chegada: string | null;
  dias_para_eta: number | null;
  alerta_data: "entregue_sem_data" | "eta_vencida" | null;
  no_mar: boolean | null;
  valor_fob_usd: number | null;
  conteineres: number | null;
}

export function useEmbarquePainel() {
  return useQuery({
    queryKey: CHAVE_EMBARQUE_PAINEL,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_importacao_embarque_painel")
        .select(
          "embarque_id,ref_rocabella,status_id,status_codigo,status_ordem,eta,data_chegada,dias_para_eta,alerta_data,no_mar,valor_fob_usd,conteineres",
        );
      if (error) throw error;
      return (data ?? []) as EmbarquePainelRow[];
    },
  });
}
