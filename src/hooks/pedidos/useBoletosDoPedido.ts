import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BoletoVigente } from "@/components/credito/AvisoBoletosVivos";

export interface BoletoTitulo {
  id: string;
  numero_parcela: number;
  total_parcelas: number;
  data_vencimento_atual: string | null;
  valor_bruto: number | null;
  boleto_status: string | null;
  linha_digitavel: string | null;
  boleto_vigente: BoletoVigente | null;
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

      // FONTE-UNICA-DO-BOLETO (02/09/2026): "registrado" e um estado do TITULO, e o
      // titulo fica em `baixa_remessa_gerada` durante a reemissao mesmo tendo boleto
      // novo vivo. Quem responde "da para enviar?" e o boleto vigente.
      const ids = (data ?? []).map((t: any) => t.id);
      const { data: vig, error: errV } = await (supabase as any)
        .from("vw_titulo_boleto_vigente")
        .select("titulo_id, enviavel, nosso_numero, linha_digitavel, data_vencimento, valor, situacao, vigente_em_baixa, boletos_vivos, nosso_numero_em_baixa")
        .in("titulo_id", ids);
      if (errV) throw new Error(`Falha ao resolver o boleto vigente: ${errV.message}`);
      const porTitulo = new Map<string, BoletoVigente>(
        (vig ?? []).map((v: any) => [v.titulo_id, v as BoletoVigente]),
      );

      const boletoTitulos: BoletoTitulo[] = ((data ?? []) as any[]).map((t) => ({
        ...t,
        boleto_vigente: porTitulo.get(t.id) ?? null,
      }));
      const qtdTotal = boletoTitulos.length;
      const qtdRegistrados = boletoTitulos.filter((t) => t.boleto_vigente?.enviavel).length;
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
