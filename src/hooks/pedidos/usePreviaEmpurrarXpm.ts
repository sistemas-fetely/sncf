import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface PreviaXpm {
  ok: boolean;
  bloqueios: string[];
  avisos: string[];
}

/**
 * Prévia (somente leitura) do empurrão pra XPM.
 * FOTO-NAO-BARRA (18/08/2026): saldo insuficiente vem em `avisos`, não em
 * `bloqueios` — a posição da XPM é foto do fim do dia anterior.
 */
export function usePreviaEmpurrarXpm(pedido_id: string, enabled = true) {
  return useQuery<PreviaXpm>({
    queryKey: ["previa-empurrar-xpm", pedido_id],
    enabled: !!pedido_id && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_xpm_payload_expedicao", {
        p_pedido_id: pedido_id,
      });
      if (error) throw new Error(error.message);
      return {
        ok: !!data?.ok,
        bloqueios: Array.isArray(data?.bloqueios) ? data.bloqueios : [],
        avisos: Array.isArray(data?.avisos) ? data.avisos : [],
      };
    },
  });
}
