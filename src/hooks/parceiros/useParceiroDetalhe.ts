import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Estágios que não contam como pedido válido pros KPIs de total/valor do parceiro:
// cancelado (desistência) e recuperacao_venda (venda perdida). Mesmo critério
// já usado como "terminal" no cálculo de pedidos_em_aberto.
const INVALIDOS = ["cancelado", "recuperacao_venda"];

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

      const { data: pedidos_agg } = await sb
        .from("pedidos")
        .select("id, valor_liquido, estagio")
        .eq("parceiro_id", id);

      const pedidosLista = pedidos_agg || [];

      // Válido = não é cancelado nem recuperação de venda (venda perdida).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pedidosValidos = pedidosLista.filter((p: any) => !INVALIDOS.includes(p.estagio));
      const total_pedidos = pedidosValidos.length;
      const pedidos_excluidos = pedidosLista.length - total_pedidos;

      const valor_total = pedidosValidos.reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (acc: number, p: any) => acc + Number(p.valor_liquido || 0),
        0
      );

      const valor_cancelado = pedidosLista
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((p: any) => INVALIDOS.includes(p.estagio))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .reduce((acc: number, p: any) => acc + Number(p.valor_liquido || 0), 0);

      // "Em aberto" = não-terminal. Mesmo critério da Fila ativa da Casa dos Pedidos:
      // entregue, cancelado e recuperacao_venda são terminais; `faturado` NÃO é
      // (NF emitida e não recebida continua aberta).
      const TERMINAIS = ["entregue", "cancelado", "recuperacao_venda"];
      const pedidos_em_aberto = pedidosLista.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => !TERMINAIS.includes(p.estagio)
      ).length;

      // Financeiro — títulos em aberto (pós-NF, doutrina FONTE-ÚNICA-CPR: título só
      // nasce no faturamento) via pedido_id -> pedidos.parceiro_id.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pedidoIds = pedidosLista.map((p: any) => p.id);
      let titulos_aberto_qtd = 0;
      let titulos_aberto_valor = 0;
      if (pedidoIds.length > 0) {
        const { data: titulos_abertos } = await sb
          .from("titulo_a_receber")
          .select("valor_atual")
          .in("pedido_id", pedidoIds)
          .eq("status", "aberto");
        titulos_aberto_qtd = (titulos_abertos || []).length;
        titulos_aberto_valor = (titulos_abertos || []).reduce(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (acc: number, t: any) => acc + Number(t.valor_atual || 0),
          0
        );
      }

      // Crédito/haver disponível (adiantamento recebido e ainda não aplicado).
      const { data: adiantamentos_disponiveis } = await sb
        .from("adiantamento_cliente")
        .select("saldo")
        .eq("parceiro_id", id)
        .eq("status", "disponivel");
      const credito_disponivel = (adiantamentos_disponiveis || []).reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (acc: number, a: any) => acc + Number(a.saldo || 0),
        0
      );

      return {
        parceiro,
        socios: socios || [],
        total_pedidos,
        pedidos_excluidos,
        valor_total,
        pedidos_em_aberto,
        valor_cancelado,
        titulos_aberto_qtd,
        titulos_aberto_valor,
        credito_disponivel,
      };
    },
  });
}
