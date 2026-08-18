import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface DeclararResponse {
  ok: boolean;
  erro?: string;
  expedicao_codigo?: string;
  pedido?: string;
  ponteiro_liberado?: boolean;
}

interface DeclararParams {
  /** Só pra invalidar cache — a RPC resolve o pedido pelo código. */
  pedido_id: string;
  expedicao_codigo: string;
  motivo: string;
}

/**
 * A ZenLOG nao devolve cancelamento pelo espelho: cancelar e DECLARACAO humana.
 * A RPC valida tudo (motivo >= 15, expedicao inexistente/ja declarada, volumes
 * contados) e devolve { ok, erro }. A UI so exibe o erro — nao replica regra.
 * `p_declarado_por` fica de fora: a RPC resolve por auth.uid().
 */
export function useDeclararCancelamentoXpm() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ expedicao_codigo, motivo }: DeclararParams): Promise<DeclararResponse> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("fn_xpm_declarar_cancelamento", {
        p_expedicao_codigo: expedicao_codigo,
        p_motivo: motivo,
      });
      if (error) throw new Error(error.message);
      const resp = (data ?? {}) as DeclararResponse;
      if (resp.ok !== true) throw new Error(resp.erro || "Falha ao declarar cancelamento");
      return resp;
    },
    onSuccess: (data, vars) => {
      toast({
        title: "Cancelamento declarado",
        description: `Expedição ${data.expedicao_codigo ?? vars.expedicao_codigo} liberada. O pedido pode ser empurrado novamente.`,
      });
      qc.invalidateQueries({ queryKey: ["pedido-xpm", vars.pedido_id] });
      qc.invalidateQueries({ queryKey: ["pedido-detalhe", vars.pedido_id] });
      qc.invalidateQueries({ queryKey: ["pedidos-fila"] });
      qc.invalidateQueries({ queryKey: ["pedidos-pipeline"] });
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao declarar cancelamento", description: e.message, variant: "destructive" });
    },
  });
}
