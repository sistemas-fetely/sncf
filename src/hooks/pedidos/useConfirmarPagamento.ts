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
      const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
      const dataBR = new Date(data_pagamento + "T00:00:00").toLocaleDateString("pt-BR");

      // 1. Registra evento de pagamento confirmado na timeline do pedido
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

      // 2. Baixa títulos boleto do pedido — se existirem (idempotente)
      //    Só processa títulos com boleto_status não nulo e ainda não pagos
      const { data: boletoTitulos, error: errBusca } = await supabase
        .from("titulo_a_receber")
        .select("id")
        .eq("pedido_id", pedido_id)
        .not("boleto_status", "is", null)
        .not("boleto_status", "in", "(pago_manual,pago_banco)");

      if (errBusca) throw errBusca;

      if (boletoTitulos && boletoTitulos.length > 0) {
        const dataPagTS = new Date(data_pagamento + "T12:00:00").toISOString();

        for (const t of boletoTitulos) {
          // 2a. marcar_titulo_pago: seta status='pago' no título + cascade CPR
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: errMarca } = await (supabase as any).rpc("marcar_titulo_pago", {
            p_titulo_id: t.id,
            p_data_pagamento: dataPagTS,
            p_observacao: observacao || null,
          });
          if (errMarca) throw errMarca;

          // 2b. Seta boleto_status = 'pago_manual' (ciclo Safra — campo separado do status financeiro)
          //     Garante que retorno bancário posterior (ocorrência 06/09) ignore este título
          const { error: errBoleto } = await supabase
            .from("titulo_a_receber")
            .update({ boleto_status: "pago_manual" })
            .eq("id", t.id);
          if (errBoleto) throw errBoleto;
        }
      }

      // 3. Avança pedido para pre_separacao (libera pro Bling)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: errTransicao } = await (supabase as any).rpc("transicionar_pedido", {
        p_pedido_id: pedido_id,
        p_para_estagio: "pre_separacao",
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
      qc.invalidateQueries({ queryKey: ["contas-receber-titulos"] });
      toast({
        title: "Pagamento confirmado",
        description: "Pedido pronto pro Bling.",
      });
    },

    onError: (e: Error) => {
      toast({ title: "Erro ao confirmar pagamento", description: e.message, variant: "destructive" });
    },
  });
}
