import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/errorMessages";

export type CanalLogistica = "b2b" | "b2c";

export interface FatoFreteRow {
  fonte: string | null;
  fonte_id: string | null;
  transportadora_id: string | null;
  documento_venda_id: string | null;
  canal: CanalLogistica | null;
  data_evento: string | null;
  custo_frete: number | null;
  uf_destino: string | null;
  municipio_destino: string | null;
  rastreio: string | null;
  documento_ref: string | null;
}

export function useLogisticaFatoFrete() {
  return useQuery({
    queryKey: ["logistica", "fato-frete"],
    queryFn: async (): Promise<FatoFreteRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_fato_frete")
        .select("*")
        .order("data_evento", { ascending: false, nullsFirst: false });
      if (error) throw new Error(humanizeError(error.message));
      return (data ?? []) as FatoFreteRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
