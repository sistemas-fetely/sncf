import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  PedidoPriorizado,
  EstagioPedido,
  AreaPedido,
} from "@/types/pedido";

export type OrdenacaoFila = "cronologico" | "prioridade_ia";

interface Opts {
  area?: AreaPedido | "todas";
  estagio?: EstagioPedido | "todos";
  estagios?: EstagioPedido[];
  busca?: string;
  ordenacao?: OrdenacaoFila;
}

export function useFilaPedidosPriorizada(opts: Opts = {}) {
  const ordenacao: OrdenacaoFila = opts.ordenacao ?? "cronologico";

  return useQuery({
    queryKey: ["fila-pedidos-priorizada", opts],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<PedidoPriorizado[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any).from("v_pedidos_priorizados").select("*");

      if (opts.area && opts.area !== "todas") {
        q = q.eq("area_atual", opts.area);
      }

      if (opts.estagios && opts.estagios.length > 0) {
        q = q.in("estagio", opts.estagios);
      } else if (opts.estagio && opts.estagio !== "todos") {
        q = q.eq("estagio", opts.estagio);
      }

      if (ordenacao === "prioridade_ia") {
        q = q
          .order("score_total", { ascending: false })
          .order("recebido_em", { ascending: true });
      } else {
        q = q.order("estagio_atualizado_em", { ascending: false, nullsFirst: false });
      }

      q = q.limit(500);

      const { data, error } = await q;
      if (error) throw error;

      let result = (data || []) as PedidoPriorizado[];

      if (opts.busca) {
        const t = opts.busca.toLowerCase();
        result = result.filter(
          (p) =>
            (p.parceiro_razao_social || "").toLowerCase().includes(t) ||
            (p.parceiro_cnpj || "").includes(t) ||
            (p.id_externo || "").toLowerCase().includes(t)
        );
      }

      return result;
    },
  });
}

/** Busca o pedido priorizado individual (pra exibir score no detalhe). */
export function usePedidoPriorizado(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["pedido-priorizado", pedidoId],
    enabled: !!pedidoId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<PedidoPriorizado | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("v_pedidos_priorizados")
        .select("*")
        .eq("id", pedidoId)
        .maybeSingle();
      if (error) throw error;
      return (data || null) as PedidoPriorizado | null;
    },
  });
}
