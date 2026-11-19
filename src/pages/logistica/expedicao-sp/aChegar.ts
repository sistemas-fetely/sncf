import type { Database } from "@/integrations/supabase/types";

export type PedidoAChegar = Database["public"]["Views"]["vw_mesa_sp_a_chegar"]["Row"];

export function filtrarAChegar(pedidos: PedidoAChegar[], cd: string, canal: string) {
  return pedidos.filter((p) => (!cd || p.cd_codigo === cd) && (!canal || p.canal?.toLowerCase() === canal));
}