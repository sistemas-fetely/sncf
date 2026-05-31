import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PedidoAguardandoPagamento } from "@/types/credito";

interface Options {
  busca?: string;
}

export function useAguardandoPagamentoFila(opts: Options = {}) {
  return useQuery({
    queryKey: ["aguardando-pagamento-fila", opts],
    staleTime: 30 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pedidos")
        .select(`
          id, id_externo, valor_liquido, estagio_atualizado_em,
          parceiro:parceiros_comerciais(razao_social, cnpj),
          titulos:titulo_a_receber(id, status, eh_entrada)
        `)
        .eq("estagio", "aguardando_pagamento")
        .order("estagio_atualizado_em", { ascending: true });

      if (error) throw error;

      const agora = Date.now();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped: PedidoAguardandoPagamento[] = (data || []).map((r: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const entradas = (r.titulos || []).filter((t: any) => t.eh_entrada);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pendentes = entradas.filter((t: any) => t.status === "pendente");
        const estagioMs = r.estagio_atualizado_em
          ? new Date(r.estagio_atualizado_em).getTime()
          : agora;
        const dias = Math.max(0, Math.floor((agora - estagioMs) / 86_400_000));
        return {
          pedido_id: r.id,
          id_externo: r.id_externo ?? "",
          parceiro_nome: r.parceiro?.razao_social ?? "—",
          parceiro_cnpj: r.parceiro?.cnpj ?? "",
          valor_liquido: Number(r.valor_liquido ?? 0),
          estagio_atualizado_em: r.estagio_atualizado_em ?? "",
          entradas_pendentes: pendentes.length,
          entradas_total: entradas.length,
          dias_aguardando: dias,
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
