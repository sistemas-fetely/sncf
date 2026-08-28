import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";

export class ReenvioPrecisaConfirmacao extends Error {
  situacaoAtual: string;
  blingId: string;
  constructor(msg: string, situacaoAtual: string, blingId: string) {
    super(msg);
    this.name = "ReenvioPrecisaConfirmacao";
    this.situacaoAtual = situacaoAtual;
    this.blingId = blingId;
  }
}

interface ReenviarParams {
  pedido_id: string;
  motivo: string;
  confirmar_nao_cancelado?: boolean;
}

interface ReenviarResponse {
  sucesso: boolean;
  bling_id?: number;
  remessa_id?: string;
  remessa_codigo?: string;
  duracao_ms?: number;
  erro?: string;
}

export function useReenviarBling() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pedido_id, motivo, confirmar_nao_cancelado }: ReenviarParams): Promise<ReenviarResponse> => {
      const { data, error } = await supabase.functions.invoke<ReenviarResponse>(
        "enviar-pedido-bling",
        { body: { acao: "reenviar", pedido_id, motivo, confirmar_nao_cancelado: !!confirmar_nao_cancelado } },
      );

      if (error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let corpo: any = null;
        try { corpo = await (error as any).context?.json?.(); } catch { /* mantém genérico */ }
        if (corpo?.requer_confirmacao) {
          throw new ReenvioPrecisaConfirmacao(
            corpo.erro ?? "Pedido não consta cancelado no Bling",
            String(corpo.situacao_atual ?? "desconhecida"),
            String(corpo.bling_id ?? ""),
          );
        }
        throw new Error(corpo?.erro ?? error.message);
      }
      if (!data?.sucesso) throw new Error(data?.erro || "Falha ao reenviar pro Bling");
      return data;
    },
    onSuccess: (data, vars) => {
      toast({
        title: "Reenviado pro Bling",
        description: `Novo id Bling: ${data.bling_id}${data.duracao_ms ? ` · ${data.duracao_ms}ms` : ""}`,
      });
      invalidarPedido(qc, vars.pedido_id);
    },
    onError: (e: Error, vars) => {
      // Confirmação pendente não é falha: o diálogo trata. Só avisa em erro real.
      if (e instanceof ReenvioPrecisaConfirmacao) return;
      toast({ title: "Erro ao reenviar pro Bling", description: e.message, variant: "destructive" });
      // A preparação pode ter acontecido antes da falha do POST: revalida sempre.
      invalidarPedido(qc, vars.pedido_id);
    },
  });
}
