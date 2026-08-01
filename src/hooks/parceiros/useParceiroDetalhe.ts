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

      const { data: socios } = await sb
        .from("socios_parceiro")
        .select("*")
        .eq("parceiro_id", id)
        .order("participacao_pct", { ascending: false, nullsFirst: false });

      const { count: total_pedidos } = await sb
        .from("pedidos")
        .select("id", { count: "exact", head: true })
        .eq("parceiro_id", id);

      const { data: pedidos_agg } = await sb
        .from("pedidos")
        .select("valor_liquido, estagio")
        .eq("parceiro_id", id);

      // Cancelado não é faturamento — não entra no valor total.
      const valor_total = (pedidos_agg || []).reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (acc: number, p: any) =>
          p.estagio === "cancelado" ? acc : acc + Number(p.valor_liquido || 0),
        0
      );

      // "Em aberto" = não-terminal. Mesmo critério da Fila ativa da Casa dos Pedidos:
      // entregue, cancelado e recuperacao_venda são terminais; `faturado` NÃO é
      // (NF emitida e não recebida continua aberta).
      const TERMINAIS = ["entregue", "cancelado", "recuperacao_venda"];
      const pedidos_em_aberto = (pedidos_agg || []).filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => !TERMINAIS.includes(p.estagio)
      ).length;

      return {
        parceiro,
        socios: socios || [],
        total_pedidos: total_pedidos || 0,
        valor_total,
        pedidos_em_aberto,
        valor_cancelado: (pedidos_agg || []).reduce(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (acc: number, p: any) =>
            p.estagio === "cancelado" ? acc + Number(p.valor_liquido || 0) : acc,
          0
        ),
      };
    },
  });
}
