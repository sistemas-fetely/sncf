import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/errorMessages";

export interface LogisticaPrazoEntregaRow {
  transportadora_id: string | null;
  entregas: number | null;
  dias_total: number | null;
  prazo_medio_dias: number | null;
}

export function useLogisticaPrazoEntrega() {
  return useQuery({
    queryKey: ["logistica", "prazo-entrega"],
    queryFn: async (): Promise<LogisticaPrazoEntregaRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_logistica_prazo_entrega")
        .select("transportadora_id, entregas, dias_total, prazo_medio_dias");
      if (error) throw new Error(humanizeError(error.message));
      return (data ?? []) as LogisticaPrazoEntregaRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
