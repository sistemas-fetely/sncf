import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Pedidos disponíveis para vincular a uma tarefa manual.
 * Fonte única: view `vw_pedido_para_vinculo`.
 * Busca por código E por nome do cliente; nunca carrega a base inteira.
 */
export interface PedidoParaVinculo {
  id: string;
  codigo: string;
  cliente: string | null;
  estagio: string | null;
  data_pedido: string | null;
  encerrado: boolean;
}

const CAMPOS = "id,codigo,cliente,estagio,data_pedido,encerrado" as const;

/** Encerrado vai para o fim da lista, o resto por data desc. */
function ordenar(linhas: PedidoParaVinculo[]): PedidoParaVinculo[] {
  return [...linhas].sort((a, b) => {
    if (a.encerrado !== b.encerrado) return a.encerrado ? 1 : -1;
    return (b.data_pedido ?? "").localeCompare(a.data_pedido ?? "");
  });
}

export function usePedidosParaVinculo(busca: string) {
  const termo = busca.trim();
  return useQuery({
    queryKey: ["pedidos", "para-vinculo", termo],
    queryFn: async (): Promise<PedidoParaVinculo[]> => {
      let q = supabase.from("vw_pedido_para_vinculo").select(CAMPOS);
      if (termo) {
        const t = termo.replace(/[%,]/g, " ");
        q = q.or(`codigo.ilike.%${t}%,cliente.ilike.%${t}%`);
      }
      const { data, error } = await q
        .order("data_pedido", { ascending: false })
        .limit(50);
      if (error) throw error;
      return ordenar((data ?? []) as PedidoParaVinculo[]);
    },
  });
}

/** Um pedido pelo id — usado para mostrar o código no card e no detalhe. */
export function usePedidoVinculado(id: string | null) {
  return useQuery({
    queryKey: ["pedidos", "para-vinculo", "id", id],
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PedidoParaVinculo | null> => {
      const { data, error } = await supabase
        .from("vw_pedido_para_vinculo")
        .select(CAMPOS)
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as PedidoParaVinculo | null;
    },
  });
}

/** Extrai o id do pedido de uma acao_url do tipo `/pedidos/{id}`. */
export function pedidoIdDaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/pedidos\/([0-9a-fA-F-]{36})/);
  return m ? m[1] : null;
}
