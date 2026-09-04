import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ItemPreviaEstoqueXpm {
  sku: string;
  nome: string;
  pedida: number;
  disponivel: number;
  falta: number;
  foto_em: string | null;
  compra_pedidos: string | null;
  compra_a_faturar: number | null;
  compra_em_transito: number | null;
}

export interface PreviaEstoqueXpm {
  foto_em: string | null;
  itens: ItemPreviaEstoqueXpm[];
}

/**
 * Prévia (somente leitura) da falta de estoque na XPM.
 * `itens` vem VAZIO quando não há falta.
 */
export function usePreviaEstoqueXpm(pedido_id: string, enabled = true) {
  return useQuery<PreviaEstoqueXpm>({
    queryKey: ["previa-estoque-xpm", pedido_id],
    enabled: !!pedido_id && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_xpm_previa_estoque", {
        p_pedido_id: pedido_id,
      });
      if (error) throw new Error(error.message);
      return {
        foto_em: data?.foto_em ?? null,
        itens: Array.isArray(data?.itens) ? data.itens : [],
      };
    },
  });
}
