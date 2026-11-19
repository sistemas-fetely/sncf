import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useListaBusca } from "@/lib/lista/useListaPaginada";

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


// LEITURA-SEM-LIMITE: busca no banco (fn_lista), 20 itens, só com 2+ caracteres.
export function usePedidosParaVinculo(busca: string) {
  const query = useListaBusca<PedidoParaVinculo>({
    relacao: "vw_pedido_para_vinculo",
    colunas: CAMPOS.split(","),
    busca,
    tamanho: 20,
    pagina: 1,
    ordem: [{ c: "encerrado", dir: "asc" }, { c: "data_pedido", dir: "desc" }],
  });
  return { ...query, data: busca.trim().length >= 2 ? query.data?.linhas : undefined };
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
