import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/errorMessages";

export interface TranspFreteUfRow {
  transportadora_id: string | null;
  destinatario_uf: string | null;
  frete_total: number | null;
  classe: string | null;
}

export function useTranspFretesUf() {
  return useQuery({
    queryKey: ["logistica", "transp-fretes-uf"],
    queryFn: async (): Promise<TranspFreteUfRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_transp_fretes")
        .select("transportadora_id, destinatario_uf, frete_total, classe");
      if (error) throw new Error(humanizeError(error.message));
      return (data ?? []) as TranspFreteUfRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
