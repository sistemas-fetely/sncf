import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useParceiroDetalhe(id: string | undefined) {
  return useQuery({
    queryKey: ["parceiro-detalhe", id],
    enabled: !!id,
    staleTime: 30 * 1000,
    queryFn: async () => {
      if (!id) throw new Error("parceiro id obrigatório");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;

      const { data: parceiro, error } = await sb
        .from("parceiros_comerciais")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;

      const { count: total_pedidos } = await sb
        .from("pedidos")
        .select("id", { count: "exact", head: true })
        .eq("parceiro_id", id);

      const { data: pedidos_agg } = await sb
        .from("pedidos")
        .select("valor_liquido, estagio")
        .eq("parceiro_id", id);

      const valor_total = (pedidos_agg || []).reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (acc: number, p: any) => acc + Number(p.valor_liquido || 0),
        0
      );
      const pedidos_em_aberto = (pedidos_agg || []).filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => !["faturado", "entregue", "cancelado"].includes(p.estagio)
      ).length;

      return {
        parceiro,
        total_pedidos: total_pedidos || 0,
        valor_total,
        pedidos_em_aberto,
      };
    },
  });
}
