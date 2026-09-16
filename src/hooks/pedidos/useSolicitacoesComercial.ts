import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CHAVE_CHAMADOS_PEDIDO } from "@/components/pedidos/AbrirChamadoPedidoDialog";

/**
 * SOLICITAÇÃO-É-CHAMADO (16/09/2026): a fila de solicitações morreu — a Central
 * de Chamados (/chamados) é o único lugar. Sobrou apenas a ABERTURA, que segue
 * chamando a mesma RPC `abrir_solicitacao_comercial`. Nenhuma leitura da tabela
 * `solicitacao_comercial` mora mais aqui (ela vai ser dropada no banco).
 */
function invalidar(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [CHAVE_CHAMADOS_PEDIDO] });
}

/** FAIL-LOUD: a mensagem do banco é a explicação; não a substituímos. */
export function useAbrirSolicitacao(pedidoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tipo: string; detalhe: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("abrir_solicitacao_comercial", {
        p_pedido_id: pedidoId,
        p_tipo: input.tipo,
        p_detalhe: input.detalhe,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Chamado aberto para o SOPS.");
      invalidar(qc);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : String(e));
    },
  });
}
