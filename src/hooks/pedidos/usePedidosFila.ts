import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PedidoFilaItem, EstagioPedido, AreaPedido } from "@/types/pedido";

interface Opts {
  area?: AreaPedido | "todas";
  estagio?: EstagioPedido | "todos";
  busca?: string;
  apenasAtivos?: boolean;
}

export function usePedidosFila(opts: Opts = {}) {
  return useQuery({
    queryKey: ["pedidos-fila", opts],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<PedidoFilaItem[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any).from("v_pedidos_fila").select("*");

      if (opts.area && opts.area !== "todas") q = q.eq("area_atual", opts.area);
      if (opts.estagio && opts.estagio !== "todos") q = q.eq("estagio", opts.estagio);
      if (opts.apenasAtivos) {
        q = q.not("estagio", "in", "(entregue,cancelado)");
      }

      q = q.order("recebido_em", { ascending: false }).limit(500);

      const { data, error } = await q;
      if (error) throw error;

      let result = (data || []) as PedidoFilaItem[];

      if (opts.busca) {
        const t = opts.busca.toLowerCase();
        result = result.filter(
          (p) =>
            (p.parceiro_razao || "").toLowerCase().includes(t) ||
            (p.parceiro_cnpj || "").includes(t) ||
            (p.id_externo || "").toLowerCase().includes(t)
        );
      }

      return result;
    },
  });
}
