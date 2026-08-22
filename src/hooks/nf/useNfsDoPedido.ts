import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface NfDoPedido {
  id: string;
  numero: string | null;
  serie: string | null;
  chave_acesso: string | null;
  pdf_url: string | null;
  data_emissao: string | null;
  situacao: string | null;
  bling_id: string | null;
}

export interface NfsDoPedido {
  /** NF principal: prefere situacao = 'autorizada'; no mesmo status, a mais recente. */
  principal: NfDoPedido | null;
  /** Demais NFs do pedido (mais recentes primeiro). */
  extras: NfDoPedido[];
  total: number;
}

/**
 * NFs de UM pedido (nfs_emitidas por pedido_venda_id).
 * Escolha da principal = mesma regra do bloco "melhorNf" de usePedidosEntregaLote:
 * prefere 'autorizada'; dentro do mesmo status, a de data_emissao mais recente.
 * ATENÇÃO: pedidos.nf_numero está morto — nunca usar.
 */
export function useNfsDoPedido(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["nfs-do-pedido", pedidoId],
    enabled: !!pedidoId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<NfsDoPedido> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("nfs_emitidas")
        .select("id, numero, serie, chave_acesso, pdf_url, data_emissao, situacao, bling_id")
        .eq("pedido_venda_id", pedidoId)
        .order("data_emissao", { ascending: false });
      if (error) throw error;

      const rows = (data || []) as NfDoPedido[];
      const ts = (v: string | null) => {
        const t = v ? Date.parse(v) : NaN;
        return Number.isNaN(t) ? -Infinity : t;
      };

      let principal: NfDoPedido | null = null;
      for (const r of rows) {
        if (!principal) {
          principal = r;
          continue;
        }
        const autP = principal.situacao === "autorizada";
        const autR = r.situacao === "autorizada";
        if (autR && !autP) principal = r;
        else if (autR === autP && ts(r.data_emissao) > ts(principal.data_emissao)) principal = r;
      }

      const extras = principal ? rows.filter((r) => r.id !== principal!.id) : [];
      return { principal, extras, total: rows.length };
    },
  });
}
