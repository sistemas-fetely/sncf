import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CobrancaFilaItem } from "@/types/credito";

interface Options {
  busca?: string;
}

export function useCobrancaFila(opts: Options = {}) {
  return useQuery({
    queryKey: ["cobranca-fila", opts],
    staleTime: 30 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pedidos")
        .select(`
          id, id_externo, valor_liquido, condicao_solicitada, estagio_atualizado_em,
          parceiro:parceiros_comerciais(razao_social, cnpj),
          analises:analises_credito(perfil_aplicado, decidido_em)
        `)
        .eq("estagio", "cobranca")
        .order("estagio_atualizado_em", { ascending: false });

      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped: CobrancaFilaItem[] = (data || []).map((r: any) => {
        // pega análise mais recente decidida (se houver)
        const analises = (r.analises || [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .slice()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .sort((a: any, b: any) =>
            (b.decidido_em || "").localeCompare(a.decidido_em || ""),
          );
        return {
          pedido_id: r.id,
          id_externo: r.id_externo ?? "",
          parceiro_nome: r.parceiro?.razao_social ?? "—",
          parceiro_cnpj: r.parceiro?.cnpj ?? "",
          valor_liquido: Number(r.valor_liquido ?? 0),
          estagio_atualizado_em: r.estagio_atualizado_em ?? "",
          perfil_aplicado: analises[0]?.perfil_aplicado ?? null,
          condicao_solicitada: r.condicao_solicitada ?? "",
        };
      });

      if (opts.busca) {
        const t = opts.busca.toLowerCase();
        return mapped.filter(
          (m) =>
            m.id_externo.toLowerCase().includes(t) ||
            m.parceiro_nome.toLowerCase().includes(t) ||
            m.parceiro_cnpj.includes(t),
        );
      }
      return mapped;
    },
  });
}
