import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RemessaSafra } from "@/types/credito";

export function useRemessasSafra() {
  return useQuery({
    queryKey: ["remessas-safra"],
    staleTime: 30 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("remessas_safra")
        .select(
          "id, nro_sequencial, gerado_em, qtd_titulos, valor_total, status, arquivo_nome, retorno_processado_em"
        )
        .order("gerado_em", { ascending: false });

      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data || []).map((r: any): RemessaSafra => ({
        id: r.id,
        nro_sequencial: r.nro_sequencial,
        gerado_em: r.gerado_em,
        qtd_titulos: r.qtd_titulos,
        valor_total: Number(r.valor_total ?? 0),
        status: r.status,
        arquivo_nome: r.arquivo_nome,
        retorno_processado_em: r.retorno_processado_em,
      }));
    },
  });
}
