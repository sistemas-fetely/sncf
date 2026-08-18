import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AchadoPedido {
  id: string;
  regra_slug: string | null;
  regra_titulo: string | null;
  severidade: string | null;
  severidade_peso: number | null;
  o_que_significa: string | null;
  detalhe: string | null;
  rota_acao: string | null;
  rotulo_acao: string | null;
  primeira_vez_em: string | null;
  idade_dias: number | null;
  reincidente: boolean | null;
}

/** Achados vivos de auditoria de um pedido. FAIL-LOUD. */
export function useAchadosPedido(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["achados-pedido", pedidoId],
    enabled: !!pedidoId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<AchadoPedido[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_auditoria_achado")
        .select(
          "id, regra_slug, regra_titulo, severidade, severidade_peso, o_que_significa, detalhe, rota_acao, rotulo_acao, primeira_vez_em, idade_dias, reincidente",
        )
        .eq("pedido_id", pedidoId)
        .eq("esta_vivo", true)
        .order("severidade_peso", { ascending: false })
        .order("primeira_vez_em", { ascending: true });
      if (error) throw error;
      return ((data || []) as AchadoPedido[]).map((a) => ({
        ...a,
        severidade_peso: a.severidade_peso === null ? null : Number(a.severidade_peso),
        idade_dias: a.idade_dias === null ? null : Number(a.idade_dias),
      }));
    },
  });
}
