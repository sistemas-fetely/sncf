import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WnsSku = {
  sku: string;
  tipo_pedido_codigo: number | null;
  produto_id: number | null;
  barra: string | null;
  total_pedidos: number | null;
  total_remessas: number | null;
  total_quantidade: number | null;
  valor_total: number | null;
  updated_at: string | null;
};

export function useWnsSkus() {
  return useQuery({
    queryKey: ["wns-skus"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb: any = supabase;
      const { data, error } = await sb
        .from("wns_skus")
        .select("*")
        .order("total_quantidade", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as WnsSku[];
    },
  });
}
