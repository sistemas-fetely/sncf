import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface NfFilaItem {
  id: string;
  nf_id: string | null;
  status: string | null;
  tentativas: number | null;
  ultimo_erro: string | null;
  enfileirado_em: string | null;
  expedicao_codigo: string | null;
  nf: { numero: string | null; serie: string | null } | null;
}

/** Linhas de `xpm_nf_fila` do pedido, com numero da NF via join em `nfs_emitidas`. */
export function useNfFilaPedido(pedido_id: string) {
  return useQuery({
    queryKey: ["nf-fila-pedido", pedido_id],
    queryFn: async (): Promise<NfFilaItem[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("xpm_nf_fila")
        .select(
          "id, nf_id, status, tentativas, ultimo_erro, enfileirado_em, expedicao_codigo, nf:nfs_emitidas(numero, serie)",
        )
        .eq("pedido_id", pedido_id)
        .order("enfileirado_em", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as NfFilaItem[];
    },
    enabled: !!pedido_id,
  });
}
