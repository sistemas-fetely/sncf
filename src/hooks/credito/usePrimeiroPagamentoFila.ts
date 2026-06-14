import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Options {
  busca?: string;
}

export interface PortaoPrimeiroPagamento {
  portao_id: string;
  pedido_id: string;
  id_externo: string;
  parceiro_nome: string;
  parceiro_cnpj: string;
  valor: number;
  data_vencimento: string;
  tipo_pagamento: string;
  dias_aguardando: number;
}

export function usePrimeiroPagamentoFila(opts: Options = {}) {
  return useQuery({
    queryKey: ["primeiro-pagamento-fila", opts.busca ?? null],
    staleTime: 30 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pedido_portao")
        .select(`
          id, pedido_id, valor, data_vencimento, tipo_pagamento, created_at,
          pedido:pedidos!pedido_portao_pedido_id_fkey(
            id_externo, valor_liquido,
            parceiro:parceiros_comerciais!parceiro_id(razao_social, nome_fantasia, cnpj)
          )
        `)
        .eq("status", "provisorio")
        .order("created_at", { ascending: true });

      if (error) throw error;

      const agora = Date.now();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped: PortaoPrimeiroPagamento[] = (data || []).map((r: any) => {
        const criadoMs = r.created_at ? new Date(r.created_at).getTime() : agora;
        const dias = Math.max(0, Math.floor((agora - criadoMs) / 86_400_000));
        return {
          portao_id: r.id,
          pedido_id: r.pedido_id,
          id_externo: r.pedido?.id_externo ?? "",
          parceiro_nome: r.pedido?.parceiro?.razao_social ?? "—",
          parceiro_cnpj: r.pedido?.parceiro?.cnpj ?? "",
          valor: Number(r.valor ?? 0),
          data_vencimento: r.data_vencimento ?? "",
          tipo_pagamento: r.tipo_pagamento ?? "—",
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
