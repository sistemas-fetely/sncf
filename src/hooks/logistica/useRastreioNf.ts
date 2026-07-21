import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/errorMessages";

export interface RastreioNfRow {
  id: string;
  transportadora_id: string;
  transportadora_nome: string | null;
  nf_numero: string | null;
  nf_serie: string | null;
  cte_numero: string | null;
  pedido_id: string | null;
  pedido_numero: string | null;
  destinatario: string | null;
  cidade_destino: string | null;
  uf_destino: string | null;
  status: string | null;
  ocorrencia_codigo: string | null;
  ocorrencia_label: string | null;
  ocorrencia_data: string | null;
  classe: string | null;
  eh_problema: boolean;
  eh_devolucao: boolean;
  data_entrega: string | null;
  previsao_entrega: string | null;
  valor_nf: number | null;
}

export function useRastreioNf() {
  return useQuery({
    queryKey: ["logistica", "rastreio-nf", "all"],
    queryFn: async (): Promise<RastreioNfRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_transp_rastreio_nf")
        .select("*")
        .order("ocorrencia_data", { ascending: false, nullsFirst: false });
      if (error) throw new Error(humanizeError(error.message));
      return (data ?? []) as RastreioNfRow[];
    },
  });
}
