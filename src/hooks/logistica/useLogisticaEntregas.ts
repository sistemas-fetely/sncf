import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EntregaRow {
  fonte: string | null;
  fonte_id: string | null;
  canal: "b2b" | "b2c" | null;
  transportadora: string | null;
  transportadora_id: string | null;
  uf_destino: string | null;
  municipio_destino: string | null;
  entregue: boolean | null;
  devolucao: boolean | null;
  data_entrega: string | null;
  previsao_entrega: string | null;
  status_texto: string | null;
  documento_ref: string | null;
  canal_contratacao: string | null;
  estado_canonico: string | null;
  estado_rotulo: string | null;
  ordem_urgencia: number | null;
  eh_problema: boolean | null;
  ocorrencia_codigo: string | null;
  ocorrencia_texto: string | null;
  ocorrencia_em: string | null;
  dias_sem_movimento: number | null;
  pedido_id: string | null;
  pedido_externo: string | null;
  cliente: string | null;
  valor: number | null;
}

/** Fonte única de verdade das entregas (B2B + B2C): view vw_logistica_rastreio. */
export function useLogisticaEntregas() {
  return useQuery({
    queryKey: ["logistica", "entregas", "vw_logistica_rastreio"],
    queryFn: async (): Promise<EntregaRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_logistica_rastreio")
        .select("*")
        .order("ordem_urgencia", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as EntregaRow[];
    },
  });
}
