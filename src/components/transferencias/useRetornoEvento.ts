import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
export type RetornoEvento = Tables<"ti_retorno"> & { pedido: { id_externo: string | null } | null };
export function usePodeOperarRetorno() {
  return useQuery({ queryKey: ["ti-retorno-permissao"], retry: false, queryFn: async () => {
    const { error } = await supabase.rpc("fn_ti_retorno_exigir_acao");
    if (error) throw error;
    return true;
  } });
}
export function useRetornosEvento() {
  return useQuery({ queryKey: ["ti-retorno-evento"], queryFn: async () => {
    const lista: RetornoEvento[] = [];
    for (let inicio = 0; ; inicio += 1000) {
      const { data, error } = await supabase.from("ti_retorno").select("*,pedido:pedidos!ti_retorno_pedido_id_fkey(id_externo)").order("criado_em", { ascending: false }).range(inicio, inicio + 999);
      if (error) throw error;
      lista.push(...data);
      if (data.length < 1000) return lista;
    }
  } });
}
export function exigirResultado(data: unknown) {
  if (!data || typeof data !== "object" || !("ok" in data) || data.ok !== true) {
    throw new Error(data && typeof data === "object" && "erro" in data ? String(data.erro) : "A operação não foi confirmada.");
  }
  return data as { ok: true; id_externo?: string; pedido_id?: string };
}