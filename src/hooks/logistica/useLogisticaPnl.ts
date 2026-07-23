import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/errorMessages";

export interface LogisticaPnlRow {
  mes: string;
  transportadora: string | null;
  cnpj_raiz: string | null;
  receita_frete: number | null;
  custo_frete: number | null;
  margem: number | null;
  base_nf: number | null;
  nfs: number | null;
  nfs_com_frete: number | null;
  ctes: number | null;
  receita_sem_custo: boolean | null;
  base_nf_com_frete: number | null;
}

export function useLogisticaPnl() {
  return useQuery({
    queryKey: ["logistica", "pnl-mensal"],
    queryFn: async (): Promise<LogisticaPnlRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_logistica_pnl_mensal")
        .select("*")
        .order("mes", { ascending: true });
      if (error) throw new Error(humanizeError(error.message));
      return (data ?? []) as LogisticaPnlRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
