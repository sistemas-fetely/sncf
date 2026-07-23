import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/errorMessages";

export interface LogisticaCustoTranspRow {
  transportadora: string | null;
  qtd_fretes: number | null;
  frete_total: number | null;
  frete_medio: number | null;
  pct_frete_nf_medio: number | null;
  peso_taxado_total: number | null;
}

export function useLogisticaCustoTransp() {
  return useQuery({
    queryKey: ["logistica", "custo-transp"],
    queryFn: async (): Promise<LogisticaCustoTranspRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_logistica_custo_transportadora")
        .select("*")
        .order("frete_total", { ascending: false });
      if (error) throw new Error(humanizeError(error.message));
      return (data ?? []) as LogisticaCustoTranspRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
