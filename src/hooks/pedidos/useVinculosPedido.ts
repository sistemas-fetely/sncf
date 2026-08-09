import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PedidoVinculo {
  id: string;
  id_externo: string;
  estagio: string;
}

export interface VinculosPedido {
  /** Pedido-pai do split (link para cima). Fonte: `split_de_pedido_id`. */
  remessa_de: PedidoVinculo | null;
  consolidado_em: PedidoVinculo | null;
  consolidou: PedidoVinculo[];
  origem: PedidoVinculo | null;
  complementares: PedidoVinculo[];
}

const COLS = "id, id_externo, estagio";

/**
 * Lê todas as ligações pedido↔pedido nas duas direções.
 * Só leitura — nenhuma escrita, nenhuma RPC.
 */
export function useVinculosPedido(params: {
  pedido_id: string;
  split_de_pedido_id: string | null;
  consolidado_em_pedido_id: string | null;
  pedido_origem_id: string | null;
}) {
  const { pedido_id, split_de_pedido_id, consolidado_em_pedido_id, pedido_origem_id } = params;

  return useQuery({
    queryKey: [
      "pedido-vinculos",
      pedido_id,
      split_de_pedido_id,
      consolidado_em_pedido_id,
      pedido_origem_id,
    ],
    enabled: !!pedido_id,
    queryFn: async (): Promise<VinculosPedido> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;

      const idsDiretos = [split_de_pedido_id, consolidado_em_pedido_id, pedido_origem_id].filter(
        Boolean
      ) as string[];

      const [consolidou, complementares, diretos] = await Promise.all([
        sb.from("pedidos").select(COLS).eq("consolidado_em_pedido_id", pedido_id).order("id_externo"),
        sb.from("pedidos").select(COLS).eq("pedido_origem_id", pedido_id).order("id_externo"),
        idsDiretos.length
          ? sb.from("pedidos").select(COLS).in("id", idsDiretos)
          : Promise.resolve({ data: [], error: null }),
      ]);

      for (const r of [consolidou, complementares, diretos]) {
        if (r?.error) throw r.error;
      }

      const acha = (id: string | null): PedidoVinculo | null =>
        id ? ((diretos.data ?? []).find((p: PedidoVinculo) => p.id === id) ?? null) : null;

      return {
        remessa_de: acha(split_de_pedido_id),
        consolidado_em: acha(consolidado_em_pedido_id),
        consolidou: (consolidou.data ?? []) as PedidoVinculo[],
        origem: acha(pedido_origem_id),
        complementares: (complementares.data ?? []) as PedidoVinculo[],
      };
    },
  });
}
