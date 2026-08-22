// ============= useRastreioPedido =============
// RASTREIO-B2B-MANUAL (22/08/2026): leitura do vínculo atual + vinculação via RPC.
// A RPC fn_registrar_rastreio_pedido valida formato (AA123456789BR), impede reuso
// em outro pedido e lança exceção com mensagem pronta pro usuário — repassar direto no toast.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface RastreioPedido {
  id: string;
  pedido_id: string;
  codigo_rastreio: string;
  servico: string | null;
  status_atual: string | null;
  entregue: boolean | null;
  data_ultima_atualizacao: string | null;
}

export function useRastreioPedido(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["pedido-rastreamento", pedidoId],
    enabled: !!pedidoId,
    queryFn: async (): Promise<RastreioPedido | null> => {
      const { data, error } = await (supabase as any)
        .from("pedido_rastreamento")
        .select("id, pedido_id, codigo_rastreio, servico, status_atual, entregue, data_ultima_atualizacao")
        .eq("pedido_id", pedidoId!)
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as RastreioPedido | null) ?? null;
    },
  });
}

export function useVincularRastreioPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pedidoId, codigoRastreio }: { pedidoId: string; codigoRastreio: string }) => {
      const { data, error } = await (supabase as any).rpc("fn_registrar_rastreio_pedido", {
        p_pedido_id: pedidoId,
        p_codigo_rastreio: codigoRastreio.trim().toUpperCase(),
        p_servico: null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["pedido-rastreamento", vars.pedidoId] });
      qc.invalidateQueries({ queryKey: ["pedido-detalhe", vars.pedidoId] });
      toast.success("Código de rastreio vinculado ao pedido.");
    },
    onError: (err: unknown) => {
      // A mensagem da RPC já vem legível pro usuário — exibir direto.
      const msg = err instanceof Error ? err.message : (err as any)?.message ?? JSON.stringify(err);
      toast.error(msg);
    },
  });
}
