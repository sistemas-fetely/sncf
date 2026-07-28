import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PedidoDetalhe {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pedido: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parceiro: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  itens: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventos: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analiseCredito: any | null;
  /** Histórico de análises do parceiro (alimenta badges de recepção: cliente novo, cooldown). */
  analisesAnteriores: Array<{ status_final: string | null; decidido_em: string | null }>;
  /** Dimensão de natureza de operação — flag que decide se a operação gera título a receber. */
  natureza: { codigo: string | null; nome: string | null; gera_titulo_receber: boolean } | null;
  idade_minutos: number;
  sla_estourado: boolean;
}

export function usePedidoDetalhe(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["pedido-detalhe", pedidoId],
    enabled: !!pedidoId,
    staleTime: 15 * 1000,
    queryFn: async (): Promise<PedidoDetalhe> => {
      if (!pedidoId) throw new Error("pedidoId obrigatório");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;

      const { data: pedido, error: pErr } = await sb
        .from("pedidos")
        .select("*")
        .eq("id", pedidoId)
        .single();
      if (pErr) throw pErr;

      const { data: parceiro } = await sb
        .from("parceiros_comerciais")
        .select("*")
        .eq("id", pedido.parceiro_id)
        .single();

      const { data: itens } = await sb
        .from("pedido_itens")
        .select("*")
        .eq("pedido_id", pedidoId)
        .order("ordem", { ascending: true });

      const { data: eventos } = await sb
        .from("pedido_eventos")
        .select("*")
        .eq("pedido_id", pedidoId)
        .order("criado_em", { ascending: false })
        .limit(100);

      const { data: analiseCredito } = await sb
        .from("analises_credito")
        .select("*")
        .eq("pedido_id", pedidoId)
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Histórico de análises do MESMO parceiro (pros badges de recepção).
      // A análise atual entra aqui com status_final = null, e o BadgesContextuais
      // ignora as abertas (só conta as com status_final !== null), então não polui.
      let analisesAnteriores: Array<{ status_final: string | null; decidido_em: string | null }> = [];
      if (pedido.parceiro_id) {
        const { data: hist } = await sb
          .from("analises_credito")
          .select("status_final, decidido_em")
          .eq("parceiro_id", pedido.parceiro_id)
          .order("criado_em", { ascending: false })
          .limit(50);
        analisesAnteriores = hist || [];
      }

      // Dimensão de natureza de operação — traz a flag `gera_titulo_receber`
      // que decide se a operação gera cobrança (título a receber). Não hardcode
      // códigos aqui; o front lê a flag da dimensão.
      let natureza: PedidoDetalhe["natureza"] = null;
      if (pedido.natureza_operacao_id) {
        const { data: nat } = await sb
          .from("naturezas_operacao")
          .select("codigo, nome, gera_titulo_receber")
          .eq("id", pedido.natureza_operacao_id)
          .maybeSingle();
        if (nat) {
          natureza = {
            codigo: nat.codigo ?? null,
            nome: nat.nome ?? null,
            gera_titulo_receber: !!nat.gera_titulo_receber,
          };
        }
      }

      const recebidoEm = new Date(pedido.recebido_em).getTime();
      const fimEm = new Date(pedido.faturado_em || pedido.cancelado_em || Date.now()).getTime();
      const idade_minutos = Math.max(0, Math.round((fimEm - recebidoEm) / 60000));
      const sla_estourado =
        !["faturado", "entregue", "cancelado"].includes(pedido.estagio) &&
        idade_minutos > 1440;

      return {
        pedido,
        parceiro,
        itens: itens || [],
        eventos: eventos || [],
        analiseCredito: analiseCredito || null,
        analisesAnteriores,
        natureza,
        idade_minutos,
        sla_estourado,
      };
    },
  });
}
