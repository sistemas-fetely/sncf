import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/errorMessages";
import type { CanalLogistica } from "./useLogisticaFatoFrete";

export interface RastreioCanonicoRow {
  fonte: string | null;
  fonte_id: string | null;
  transportadora_id: string | null;
  transportadora: string | null;
  canal: CanalLogistica | null;
  uf_destino: string | null;
  municipio_destino: string | null;
  entregue: boolean | null;
  devolucao: boolean | null;
  data_entrega: string | null;
  previsao_entrega: string | null;
  status_texto: string | null;
  documento_ref: string | null;
}

export function useLogisticaRastreioCanonico() {
  return useQuery({
    queryKey: ["logistica", "rastreio-canonico"],
    queryFn: async (): Promise<RastreioCanonicoRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_logistica_rastreio")
        .select("*");
      if (error) throw new Error(humanizeError(error.message));
      return (data ?? []) as RastreioCanonicoRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
