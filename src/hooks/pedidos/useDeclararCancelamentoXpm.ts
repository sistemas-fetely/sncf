import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";

interface DeclararResponse {
  ok: boolean;
  erro?: string;
  expedicao_codigo?: string;
  pedido?: string;
  ponteiro_liberado?: boolean;
  estagio_de?: string | null;
  estagio_para?: string | null;
  estagio_revertido?: boolean;
  aviso?: string | null;
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
 *
 * CANCELAMENTO-DESFAZ-O-EMPURRAO (28/08/2026): a RPC tambem regride o estagio
 * para pre_separacao (onde o pedido pode ser editado e reenviado). Quando nao
 * consegue — pedido com NF, pedido pausado — ela devolve `aviso` em vez de
 * falhar, e a tela grita o aviso num toast separado.
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
      const codigo = data.expedicao_codigo ?? vars.expedicao_codigo;
      toast({
        title: "Cancelamento declarado",
        description: data.estagio_revertido
          ? `Expedição ${codigo} liberada. O pedido voltou para Pré-Separação — edite os itens e empurre de novo.`
          : `Expedição ${codigo} liberada. O pedido pode ser empurrado novamente.`,
      });
      if (data.aviso) {
        toast({
          title: "Estágio não voltou para Pré-Separação",
          description: data.aviso,
          variant: "destructive",
        });
      }
      invalidarPedido(qc, vars.pedido_id);
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao declarar cancelamento", description: e.message, variant: "destructive" });
    },
  });
}
