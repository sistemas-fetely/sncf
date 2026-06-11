import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface SplitParams {
  pedido_id: string;
  itens_original: { descricao: string; sku: string; quantidade: number; valor_unitario: number }[];
  itens_split:    { descricao: string; sku: string; quantidade: number; valor_unitario: number }[];
  valor_original: number;
  valor_split:    number;
  estagio_inicial: "aguardando_estoque" | "pre_faturado" | "cobranca";
  data_entrega_prevista?: string | null;
  observacao?: string | null;
  financeiro_coberto?: boolean;
}

interface SplitResult {
  novo_pedido_id:  string;
  novo_id_externo: string;
  sequencia:       number;
}

export function useCriarSplit() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (p: SplitParams): Promise<SplitResult> => {
      const { data, error } = await (supabase as any).rpc("criar_split_pedido", {
        p_pedido_id:             p.pedido_id,
        p_itens_original:        p.itens_original,
        p_itens_split:           p.itens_split,
        p_valor_original:        p.valor_original,
        p_valor_split:           p.valor_split,
        p_estagio_inicial:       p.estagio_inicial,
        p_data_entrega_prevista: p.data_entrega_prevista ?? null,
        p_observacao:            p.observacao ?? null,
        p_financeiro_coberto:    p.financeiro_coberto ?? false,
      });
      if (error) throw error;
      return data as SplitResult;
    },
    onSuccess: (data, vars) => {
      toast({
        title: "Split criado com sucesso",
        description: `Novo pedido ${data.novo_id_externo} criado`,
      });
      qc.invalidateQueries({ queryKey: ["splits", vars.pedido_id] });
      qc.invalidateQueries({ queryKey: ["pedido", vars.pedido_id] });
      qc.invalidateQueries({ queryKey: ["pedido-detalhe", vars.pedido_id] });
      qc.invalidateQueries({ queryKey: ["pedidos-fila"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error
        ? err.message
        : (err as any)?.message ?? JSON.stringify(err);
      toast({ title: "Erro ao criar split", description: msg, variant: "destructive" });
    },
  });
}
