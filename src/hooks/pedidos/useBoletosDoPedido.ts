import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BoletoTitulo {
  id: string;
  numero_parcela: number;
  total_parcelas: number;
  data_vencimento_atual: string | null;
  valor_bruto: number | null;
  boleto_status: string | null;
  linha_digitavel: string | null;
}

export function useBoletosDoPedido(pedido_id: string | undefined) {
  return useQuery({
    queryKey: ["boletos-do-pedido", pedido_id],
    enabled: !!pedido_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("titulo_a_receber")
        .select("id, numero_parcela, total_parcelas, data_vencimento_atual, valor_bruto, boleto_status, linha_digitavel")
        .eq("pedido_id", pedido_id)
        .eq("tipo_pagamento", "boleto");
      if (error) throw error;
      const boletoTitulos: BoletoTitulo[] = (data ?? []) as any;
      const qtdTotal = boletoTitulos.length;
      const qtdRegistrados = boletoTitulos.filter(
        (t) =>
          (t.boleto_status === "registrado" ||
            t.boleto_status === "remessa_gerada" ||
            t.boleto_status === "vencido") &&
          !!t.linha_digitavel,
      ).length;
      return {
        boletoTitulos,
        temBoletos: qtdTotal > 0,
        qtdTotal,
        qtdRegistrados,
        todosRegistrados: qtdTotal > 0 && qtdRegistrados === qtdTotal,
      };
    },
  });
}
