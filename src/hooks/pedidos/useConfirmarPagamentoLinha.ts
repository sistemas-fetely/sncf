import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { rawMessage } from "@/lib/format-error";

export type ProvaTipo = "pix_txid" | "cartao_nsu" | "haver" | "ofx" | "manual" | "boleto_cnab";

interface Args {
  provisao_id: string;
  prova_tipo: ProvaTipo;
  prova_ref?: string | null;
  data_pagamento: string; // ISO (date ou timestamptz)
  observacao?: string | null;
  /** Texto pronto de qual meio ainda falta (ex.: "1 parcela de PIX").
   *  Só alimenta o toast — a régua de portão continua sendo do banco. */
  falta_label?: string | null;
}

export interface ConfirmarLinhaResult {
  ok: boolean;
  provisao_id?: string;
  pedido_id?: string;
  valor?: number;
  eh_portao?: boolean;
  adiantamento_id?: string | null;
  /** Parcelas de cartão irmãs quitadas pela mesma captura. */
  linhas_propagadas?: number;
  valor_propagado?: number;
  portao_linhas_faltando?: number;
  portao_valor_faltando?: number;
  avancou?: boolean;
}


const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Confirma o pagamento de UMA linha do plano (`provisao_recebimento`).
 * O pedido só é liberado quando TODAS as linhas de portão estiverem pagas —
 * quem decide isso é o banco, e a resposta diz o que ainda falta.
 */
export function useConfirmarPagamentoLinha() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (args: Args): Promise<ConfirmarLinhaResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("confirmar_pagamento_linha", {
        p_provisao_id: args.provisao_id,
        p_prova_tipo: args.prova_tipo,
        p_prova_ref: args.prova_ref?.trim() || null,
        p_data_pagamento: args.data_pagamento,
        p_observacao: args.observacao?.trim() || null,
      });
      if (error) throw error;
      return (data ?? { ok: true }) as ConfirmarLinhaResult;
    },

    onSuccess: (res, args) => {
      const faltando = res.portao_linhas_faltando ?? 0;
      const propagadas = res.linhas_propagadas ?? 0;

      const linhas: string[] = [];
      if (propagadas > 0) {
        linhas.push(
          `${propagadas} parcela(s) de cartão confirmadas pela mesma captura${
            res.valor_propagado ? ` (${fmtBRL.format(Number(res.valor_propagado))})` : ""
          }.`,
        );
      }
      if (!res.avancou && faltando > 0) {
        linhas.push(
          `Ainda faltam ${faltando} linha(s) de portão, somando ${fmtBRL.format(
            Number(res.portao_valor_faltando ?? 0),
          )}.`,
        );
        if (args.falta_label) linhas.push(`Falta: ${args.falta_label}`);
      }

      toast({
        title: res.avancou
          ? "Portão completo. Pedido liberado para Pré-Separação."
          : "Pagamento registrado",
        description: linhas.length ? linhas.join(" ") : undefined,
      });


      const keys: (readonly unknown[])[] = [
        ["pedido-detalhe", res.pedido_id],
        ["pedido-portao-provisorio", res.pedido_id],
        ["provisoes-pedido", res.pedido_id],
        ["plano-aberto-pedido", res.pedido_id],
        ["provisao-portao-pendente", res.pedido_id],
        ["pedidos-fila"],
        ["pedidos-pipeline"],
        ["contas-receber-titulos"],
        ["primeiro-pagamento-fila"],
        ["cobranca-fila"],
      ];
      keys.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
    },

    onError: (e: unknown) => {
      console.error("[confirmar_pagamento_linha]", e);
      toast({
        title: "Erro ao confirmar pagamento",
        description: rawMessage(e),
        variant: "destructive",
      });
    },
  });
}
