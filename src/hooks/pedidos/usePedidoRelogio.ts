import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PedidoRelogio {
  dias_total: number;
  dias_nossos: number;
  dias_espera: number;
}

/** Lê `v_pedido_relogio` e devolve um Map por pedido_id. FAIL-LOUD. */
export function usePedidoRelogio(pedidoIds: string[]) {
  const ids = [...new Set(pedidoIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: ["pedido-relogio", ids],
    staleTime: 30 * 1000,
    enabled: ids.length > 0,
    queryFn: async (): Promise<Map<string, PedidoRelogio>> => {
      // Lido por chave (pedido_id) em lotes de 200 — nunca a view inteira.
      const data: unknown[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const lote = ids.slice(i, i + 200);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: parte, error } = await (supabase as any)
          .from("v_pedido_relogio")
          .select("pedido_id, dias_total, dias_nossos, dias_espera")
          .in("pedido_id", lote);
        if (error) throw error;
        data.push(...(parte ?? []));
      }
      const m = new Map<string, PedidoRelogio>();
      (
        (data || []) as Array<{
          pedido_id: string;
          dias_total: number | null;
          dias_nossos: number | null;
          dias_espera: number | null;
        }>
      ).forEach((r) => {
        if (!r.pedido_id) return;
        m.set(r.pedido_id, {
          dias_total: Number(r.dias_total ?? 0),
          dias_nossos: Number(r.dias_nossos ?? 0),
          dias_espera: Number(r.dias_espera ?? 0),
        });
      });
      return m;
    },
  });
}
