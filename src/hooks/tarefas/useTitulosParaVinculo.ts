import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

/** Encerrado vai para o fim; o resto por vencimento mais próximo primeiro. */
function ordenar(linhas: TituloParaVinculo[]): TituloParaVinculo[] {
  return [...linhas].sort((a, b) => {
    if (a.encerrado !== b.encerrado) return a.encerrado ? 1 : -1;
    return (a.vencimento ?? "9999-12-31").localeCompare(b.vencimento ?? "9999-12-31");
  });
}

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

export function useTitulosParaVinculo(busca: string) {
  const termo = busca.trim();
  return useQuery({
    queryKey: ["titulos", "para-vinculo", termo],
    queryFn: async (): Promise<TituloParaVinculo[]> => {
      let q = supabase.from("vw_titulo_para_vinculo").select(CAMPOS);
      if (termo) {
        const t = termo.replace(/[%,]/g, " ");
        q = q.or(`codigo.ilike.%${t}%,cliente.ilike.%${t}%`);
      }
      const { data, error } = await q
        .order("vencimento", { ascending: true })
        .limit(50);
      if (error) throw error;
      return ordenar((data ?? []) as TituloParaVinculo[]);
    },
  });
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
