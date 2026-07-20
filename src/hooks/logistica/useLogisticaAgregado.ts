import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LogisticaAgregadoRow {
  transportadora_id: string;
  transportadora: string | null;
  cnpj: string | null;
  uf: string | null;
  total_ctes: number | null;
  frete_total: number | null;
  valor_nf_total: number | null;
  pct_frete_nf: number | null;
  entregues: number | null;
  em_transito: number | null;
  coletados: number | null;
  atencao: number | null;
  com_pedido: number | null;
  total_nfs: number | null;
  devolucoes: number | null;
}

export function useLogisticaAgregado() {
  return useQuery({
    queryKey: ["logistica", "agregado"],
    queryFn: async (): Promise<LogisticaAgregadoRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_logistica_agregado")
        .select("*");
      if (error) throw error;
      return (data ?? []) as LogisticaAgregadoRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
