import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PedidoRelogio {
  dias_total: number;
  dias_nossos: number;
  dias_espera: number;
}

/** Lê `v_pedido_relogio` e devolve um Map por pedido_id. FAIL-LOUD. */
export function usePedidoRelogio() {
  return useQuery({
    queryKey: ["pedido-relogio"],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<Map<string, PedidoRelogio>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("v_pedido_relogio")
        .select("pedido_id, dias_total, dias_nossos, dias_espera");
      if (error) throw error;
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
