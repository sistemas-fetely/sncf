import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PedidoFilaItem, EstagioPedido, AreaPedido } from "@/types/pedido";

interface Opts {
  area?: AreaPedido | "todas";
  /** Filtro de UM estágio específico OU 'todos' */
  estagio?: EstagioPedido | "todos";
  /** Filtro de MÚLTIPLOS estágios (tem prioridade sobre `estagio`) */
  estagios?: EstagioPedido[];
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

      if (opts.estagios && opts.estagios.length > 0) {
        q = q.in("estagio", opts.estagios);
      } else if (opts.estagio && opts.estagio !== "todos") {
        q = q.eq("estagio", opts.estagio);
      }

      if (opts.apenasAtivos) {
        q = q.not("estagio", "in", "(entregue,cancelado,recuperacao_venda)");
      }

      q = q.order("recebido_em", { ascending: false }).limit(500);

      const { data, error } = await q;
      if (error) throw error;

      let result = (data || []) as PedidoFilaItem[];

      // Merge de situação financeira (fonte única: vw_pedido_situacao_financeira,
      // derivada apenas de titulo_a_receber). Substitui a leitura de portão como
      // estado financeiro na UI. O portão continua sendo apenas gate de liberação.
      if (result.length > 0) {
        const ids = result.map((p) => p.id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: sfRows, error: sfErr } = await (supabase as any)
          .from("vw_pedido_situacao_financeira")
          .select(
            "pedido_id, situacao_financeira, situacao_rotulo, valor_pago, valor_aberto, valor_vencido, dias_atraso_max, delta_pedido_titulo",
          )
          .in("pedido_id", ids);
        if (sfErr) throw sfErr;
        const sfMap = new Map<string, Record<string, unknown>>();
        (sfRows || []).forEach((r: { pedido_id: string } & Record<string, unknown>) => {
          sfMap.set(r.pedido_id, r);
        });
        result = result.map((p) => {
          const sf = sfMap.get(p.id);
          if (!sf) return p;
          return {
            ...p,
            situacao_financeira: sf.situacao_financeira as PedidoFilaItem["situacao_financeira"],
            situacao_rotulo: sf.situacao_rotulo as string | null,
            valor_pago: sf.valor_pago as number | null,
            valor_aberto: sf.valor_aberto as number | null,
            valor_vencido: sf.valor_vencido as number | null,
            dias_atraso_max: sf.dias_atraso_max as number | null,
            delta_pedido_titulo: sf.delta_pedido_titulo as number | null,
          };
        });
      }

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
