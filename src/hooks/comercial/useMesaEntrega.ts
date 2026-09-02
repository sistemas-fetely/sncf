// PARALELO-NAO-PENDURADO: esta view é lida em hook SEPARADO e casada por pedido_id
// no cliente. NÃO juntar em vw_mesa_comercial — ela já leva ~3s e o join estourou
// timeout na medição de 02/09.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MesaEntregaRow {
  pedido_id: string;
  id_externo: string | null;
  fase_codigo: string | null;
  fase_rotulo: string | null;
  fase_ordem: number | null;
  fase_area: string | null;
  fase_eh_final: boolean | null;
  fase_eh_desvio: boolean | null;
  data_entrega: string | null;
  previsao_entrega: string | null;
  previsao_fonte: string | null;
  previsao_confianca: string | null;
  previsao_motivo_sem_data: string | null;
  meta_provisoria: boolean | null;
  transportadora_id: string | null;
  transportadora: string | null;
  rastreio_codigo: string | null;
  rastreio_servico: string | null;
  rastreio_status_texto: string | null;
  rastreio_rotulo: string | null;
  rastreio_classe: string | null;
  rastreio_entregue: boolean | null;
  rastreio_atualizado_em: string | null;
  rastreio_alerta: boolean | null;
}

export interface MesaEntregaResultado {
  linhas: MesaEntregaRow[];
  porPedido: Map<string, MesaEntregaRow>;
}

export function useMesaEntrega() {
  return useQuery({
    queryKey: ["mesa-entrega"],
    staleTime: 60_000,
    queryFn: async (): Promise<MesaEntregaResultado> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_mesa_entrega")
        .select("*");
      // FAIL-LOUD: erro sobe; a mesa nunca finge que não há fase/entrega.
      if (error) throw new Error(error.message);
      const linhas = (data ?? []) as MesaEntregaRow[];
      return {
        linhas,
        porPedido: new Map(linhas.map((l) => [l.pedido_id, l])),
      };
    },
  });
}
