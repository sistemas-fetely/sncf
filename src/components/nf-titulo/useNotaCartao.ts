import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatError } from "@/lib/format-error";
import { db } from "./usePerfilPagamento";

export interface NotaCartao {
  nf_id: string;
  nf_numero: string | null;
  fornecedor: string | null;
  nf_valor: number | null;
  emissao: string | null;
  meio_pagamento: string | null;
  lancamento_id: string;
  cartao_descricao: string | null;
  data_compra: string | null;
  valor_parcela: number | null;
  parcelas: number | null;
  situacao: "confirmar" | "ambiguo";
}

export const QK_NOTA_CARTAO = ["nf-cartao-fila"];

export function useNotaCartao() {
  return useQuery({
    queryKey: QK_NOTA_CARTAO,
    queryFn: async (): Promise<NotaCartao[]> => {
      const { data, error } = await db.rpc<NotaCartao[]>("fn_nf_cartao_fila", {});
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDecidirNotaCartao(onOk: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ linha, confirmar }: { linha: NotaCartao; confirmar: boolean }) => {
      const { error } = await db.rpc<unknown>(confirmar ? "fn_nf_cartao_confirmar" : "fn_nf_cartao_recusar", { p_nf_id: linha.nf_id, p_lancamento_id: linha.lancamento_id });
      if (error) throw error;
    },
    onSuccess: async (_, { confirmar }) => {
      await qc.invalidateQueries({ queryKey: QK_NOTA_CARTAO });
      toast.success(confirmar ? "Nota ligada à compra. A despesa não conta mais em dobro." : "Par recusado. Não é a mesma compra.");
      onOk();
    },
    onError: (erro) => toast.error(formatError(erro)),
  });
}