import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Args {
  pedidoId: string;
  motivo: string;
}

/**
 * Reabre a análise de crédito de um pedido.
 * NÃO confundir com o botão "Reanalisar" do CardAnalisePedido, que chama
 * `analisar_pedido_vs_programa` (checagem do programa comercial).
 * Esta ação chama `reabrir_analise_pedido` e devolve o pedido para
 * `em_analise_credito`, criando uma nova análise vinculada.
 */
export function useReabrirAnalisePedido() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pedidoId, motivo }: Args) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        "reabrir_analise_pedido",
        { p_pedido_id: pedidoId, p_motivo: motivo },
      );
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.erro ?? "Erro ao reabrir análise");
      return data as { ok: true; analise_id: string };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["pedido-detalhe", vars.pedidoId] });
      qc.invalidateQueries({ queryKey: ["pedido-titulos", vars.pedidoId] });
      qc.invalidateQueries({ queryKey: ["cobranca-proposta", vars.pedidoId] });
      qc.invalidateQueries({ queryKey: ["cobranca-pedido-minimo", vars.pedidoId] });
      qc.invalidateQueries({ queryKey: ["cobranca-fila"] });
      qc.invalidateQueries({ queryKey: ["pedidos-fila"] });
      qc.invalidateQueries({ queryKey: ["pedidos-pipeline"] });
      qc.invalidateQueries({ queryKey: ["aguardando-pagamento-fila"] });
      qc.invalidateQueries({ queryKey: ["avaliar-impacto-edicao", vars.pedidoId] });
      toast({
        title: "Pedido enviado para reanálise",
        description: "Uma nova análise de crédito foi criada.",
      });
    },
    onError: (e: Error) => {
      toast({
        title: "Erro ao reabrir análise",
        description: e.message,
        variant: "destructive",
      });
    },
  });
}
