import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/errorMessages";

export interface LogisticaCustoUfRow {
  uf: string | null;
  transportadora: string | null;
  ctes: number | null;
  custo_frete: number | null;
}

export function useLogisticaCustoUf() {
  return useQuery({
    queryKey: ["logistica", "custo-uf"],
    queryFn: async (): Promise<LogisticaCustoUfRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_logistica_custo_uf")
        .select("*")
        .order("custo_frete", { ascending: false });
      if (error) throw new Error(humanizeError(error.message));
      return (data ?? []) as LogisticaCustoUfRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
