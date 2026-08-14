import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type NfArquivoPedido = {
  pedido_id: string;
  nf_id: string | null;
  bling_id: string | null;
  pode_baixar: boolean | null;
  numero: string | null;
  serie: string | null;
  pdf_url: string | null;
  xml_url: string | null;
  tem_pdf: boolean | null;
  tem_xml: boolean | null;
};

/**
 * Uma única query em vw_pedido_nf_arquivo para todos os pedidos da tabela.
 * Retorna Map indexado por pedido_id.
 */
export function useNfsDosPedidosParceiro(pedidoIds: string[]) {
  const ids = Array.from(new Set(pedidoIds.filter(Boolean))).sort();

  return useQuery({
    queryKey: ["pedido-nf-arquivo", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_pedido_nf_arquivo" as any)
        .select("pedido_id, nf_id, bling_id, pode_baixar, numero, serie, pdf_url, xml_url, tem_pdf, tem_xml")
        .in("pedido_id", ids);
      if (error) throw error;
      const mapa = new Map<string, NfArquivoPedido>();
      for (const r of (data || []) as unknown as NfArquivoPedido[]) {
        if (r.pedido_id) mapa.set(r.pedido_id, r);
      }
      return mapa;
    },
  });
}
