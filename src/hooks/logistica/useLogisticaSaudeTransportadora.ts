import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SaudeTransportadoraRow {
  transportadora: string | null;
  canal: "b2b" | "b2c" | string | null;
  remessas: number | null;
  entregues: number | null;
  mensuraveis: number | null;
  no_prazo: number | null;
  atrasadas: number | null;
  otd_pct: number | null;
  gap_medio_dias: number | null;
  pior_atraso_dias: number | null;
  com_problema: number | null;
  paradas_7d: number | null;
  sem_estado: number | null;
  valor_em_transito: number | null;
  modo_alimentacao: string | null;
  arquivos_importados: number | null;
  ultima_ocorrencia: string | null;
  ultima_importacao: string | null;
  dias_feed_atrasado: number | null;
  feed_velho: boolean | null;
  cobertura_medicao_pct: number | null;
}

/** Saúde de prazo por transportadora × canal: view vw_logistica_saude_transportadora. */
export function useLogisticaSaudeTransportadora() {
  return useQuery({
    queryKey: ["logistica", "saude-transportadora", "vw_logistica_saude_transportadora"],
    queryFn: async (): Promise<SaudeTransportadoraRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_logistica_saude_transportadora")
        .select("*")
        .order("remessas", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SaudeTransportadoraRow[];
    },
  });
}
