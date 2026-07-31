import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FilaFeedRow {
  transportadora: string | null;
  canal: "b2b" | "b2c" | string | null;
  modo_alimentacao: string | null;
  ultima_ocorrencia: string | null;
  ultima_importacao: string | null;
  dias_feed_atrasado: number | null;
  remessas: number | null;
  otd_pct: number | null;
  diagnostico: string | null;
  severidade: number | null;
}

/** Transportadoras cujo rastreio parou de receber dado novo: view vw_logistica_fila_feed. */
export function useLogisticaFilaFeed() {
  return useQuery({
    queryKey: ["logistica", "fila-feed", "vw_logistica_fila_feed"],
    queryFn: async (): Promise<FilaFeedRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_logistica_fila_feed")
        .select("*")
        .order("severidade", { ascending: true })
        .order("remessas", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FilaFeedRow[];
    },
  });
}
