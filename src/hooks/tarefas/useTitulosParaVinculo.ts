import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useListaBusca } from "@/lib/lista/useListaPaginada";

/**
 * Títulos a receber disponíveis para vincular a uma tarefa manual.
 * Fonte única: view `vw_titulo_para_vinculo`.
 * Busca por código E por nome do cliente; nunca carrega a base inteira.
 */
export interface TituloParaVinculo {
  id: string;
  codigo: string;
  cliente: string | null;
  status: string | null;
  valor_atual: number | null;
  vencimento: string | null;
  encerrado: boolean;
  vencido: boolean;
  pedido_codigo: string | null;
}

const CAMPOS =
  "id,codigo,cliente,status,valor_atual,vencimento,encerrado,vencido,pedido_codigo" as const;


/** Rota real do detalhe do título: drawer da aba Títulos da tela de Cobrança. */
export function urlTitulo(id: string): string {
  return `/recebimento/cobranca?aba=titulos&titulo=${id}`;
}

/** Extrai o id do título de uma acao_url do tipo `...?aba=titulos&titulo={id}`. */
export function tituloIdDaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/[?&]titulo=([0-9a-fA-F-]{36})/);
  return m ? m[1] : null;
}

// LEITURA-SEM-LIMITE: busca no banco (fn_lista), 20 itens, só com 2+ caracteres.
export function useTitulosParaVinculo(busca: string) {
  const query = useListaBusca<TituloParaVinculo>({
    relacao: "vw_titulo_para_vinculo",
    colunas: CAMPOS.split(","),
    busca,
    tamanho: 20,
    pagina: 1,
    ordem: [{ c: "encerrado", dir: "asc" }, { c: "vencimento", dir: "asc" }],
  });
  return { ...query, data: busca.trim().length >= 2 ? query.data?.linhas : undefined };
}

/** Um título pelo id — usado para mostrar o código no selo e no detalhe. */
export function useTituloVinculado(id: string | null) {
  return useQuery({
    queryKey: ["titulos", "para-vinculo", "id", id],
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<TituloParaVinculo | null> => {
      const { data, error } = await supabase
        .from("vw_titulo_para_vinculo")
        .select(CAMPOS)
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as TituloParaVinculo | null;
    },
  });
}
