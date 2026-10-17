import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { temCondicaoPendente } from "@/lib/pedidos/condicaoPendente";

/** IDs (dentre os visíveis em Recebido) com condição de pagamento a confirmar. */
export function useCondicaoPendenteLote(ids: string[]) {
  const chave = [...ids].sort();
  return useQuery({
    queryKey: ["pedido-condicao-pendente-lote", chave],
    enabled: chave.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await (supabase as any)
        .from("pedidos")
        .select("id, estagio, recebido_via, canal, condicao_pagamento_id, natureza_operacao_id")
        .in("id", chave);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const natIds = Array.from(new Set(rows.map((r) => r.natureza_operacao_id).filter(Boolean)));
      const gera = new Map<string, boolean>();
      if (natIds.length) {
        const { data: nats, error: e2 } = await (supabase as any)
          .from("naturezas_operacao")
          .select("id, gera_titulo_receber")
          .in("id", natIds);
        if (e2) throw e2;
        for (const n of nats ?? []) gera.set(n.id, n.gera_titulo_receber !== false);
      }
      return new Set(
        rows.filter((r) => temCondicaoPendente(r, gera.get(r.natureza_operacao_id) ?? true)).map((r) => r.id),
      );
    },
  });
}
