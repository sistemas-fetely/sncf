import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AnaliseListItem, EstagioAnalise } from "@/types/credito";

interface UseAnalisesFilaOptions {
  estagio?: EstagioAnalise;
  apenasAbertas?: boolean;
  busca?: string;
}

export function useAnalisesFila(opts: UseAnalisesFilaOptions = {}) {
  return useQuery({
    queryKey: ["analises-fila", opts],
    staleTime: 30 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("analises_credito")
        .select(`
          id, pedido_id, parceiro_id, estagio_atual, status_final,
          criado_em, decidido_em,
          analise_ia_confianca, analise_ia_processada_em,
          parceiro:parceiros_comerciais(cnpj, razao_social),
          pedido:pedidos(id_externo, valor_liquido, condicao_solicitada),
          transicoes:analise_credito_transicoes(acao)
        `)
        .order("criado_em", { ascending: false });

      if (opts.estagio) q = q.eq("estagio_atual", opts.estagio);
      if (opts.apenasAbertas !== false) q = q.is("status_final", null);

      const { data, error } = await q;
      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped: AnaliseListItem[] = (data || []).map((r: any) => ({
        id: r.id,
        pedido_id: r.pedido_id,
        parceiro_id: r.parceiro_id,
        estagio_atual: r.estagio_atual,
        status_final: r.status_final,
        criado_em: r.criado_em,
        decidido_em: r.decidido_em,
        parceiro_cnpj: r.parceiro?.cnpj ?? null,
        parceiro_razao: r.parceiro?.razao_social ?? null,
        pedido_valor_liquido: Number(r.pedido?.valor_liquido ?? 0),
        pedido_condicao: r.pedido?.condicao_solicitada ?? "",
        pedido_id_externo: r.pedido?.id_externo ?? "",
        analise_ia_confianca: r.analise_ia_confianca,
        analise_ia_processada_em: r.analise_ia_processada_em,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        foi_devolvida: (r.transicoes || []).some((t: any) => t.acao === "devolvido"),
      }));

      if (opts.busca) {
        const termo = opts.busca.toLowerCase();
        return mapped.filter(
          (a) =>
            (a.parceiro_razao || "").toLowerCase().includes(termo) ||
            (a.parceiro_cnpj || "").includes(termo) ||
            a.pedido_id_externo.toLowerCase().includes(termo)
        );
      }

      return mapped;
    },
  });
}
