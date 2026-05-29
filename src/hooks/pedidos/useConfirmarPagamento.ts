import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Args {
  pedido_id: string;
  data_pagamento: string;   // YYYY-MM-DD
  valor: number;
  comprovante_link?: string;
  observacao?: string;
}

export function useConfirmarPagamento() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pedido_id, data_pagamento, valor, comprovante_link, observacao }: Args) => {
      // 1. Registra evento de pagamento confirmado
      const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
      const dataBR = new Date(data_pagamento + "T00:00:00").toLocaleDateString("pt-BR");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: errEvento } = await (supabase as any).rpc("registrar_operacao_pedido", {
        p_pedido_id: pedido_id,
        p_tipo_evento: "pagamento_confirmado",
        p_descricao: `Pagamento confirmado — ${fmtBRL.format(valor)} em ${dataBR}`,
        p_metadata: {
          data_pagamento,
          valor,
          comprovante_link: comprovante_link || undefined,
          observacao: observacao || undefined,
        },
        p_proxima_acao: null,
      });
      if (errEvento) throw errEvento;

      // 2. Avança estágio pra pre_faturado (engine F-2 gera os títulos)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: errTransicao } = await (supabase as any).rpc("transicionar_pedido", {
        p_pedido_id: pedido_id,
        p_para_estagio: "pre_faturado",
        p_proxima_acao: "Pronto pra enviar pro Bling",
        p_motivo: "Pagamento confirmado",
      });
      if (errTransicao) throw errTransicao;

      return { ok: true };
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["pedido-detalhe", vars.pedido_id] });
      qc.invalidateQueries({ queryKey: ["pedidos-fila"] });
      qc.invalidateQueries({ queryKey: ["pedidos-pipeline"] });
      toast({
        title: "Pagamento confirmado",
        description: "Pedido pronto pro Bling.",
      });
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });
}
