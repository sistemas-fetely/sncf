import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface NfEmitida {
  id: string;
  bling_id: string | null;
  numero: string | null;
  serie: string | null;
  data_emissao: string | null;
  situacao: string | null;
  valor_nota: number | null;
  valor_frete: number | null;
  parceiro_id: string | null;
  pedido_venda_id: string | null;
  pedido: { id_externo: string } | null;
  pdf_url: string | null;
  xml_url: string | null;
  tipo: string | null;
  parceiro: { razao_social: string; cnpj: string } | null;
  numero_pedido_loja: string | null;
  bling_pedido_venda_numero: string | null;
  bling_pedido_venda_id: string | null;
  pedido_ref: string | null;
  canal: "B2B" | "B2C" | null;
}

export function useNfsEmitidas() {
  return useQuery({
    queryKey: ["nfs_emitidas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nfs_emitidas")
        .select("id, bling_id, numero, serie, data_emissao, situacao, valor_nota, valor_frete, parceiro_id, pedido_venda_id, pedido:pedidos(id_externo), pdf_url, xml_url, tipo, parceiro:parceiros_comerciais(razao_social, cnpj), numero_pedido_loja, bling_pedido_venda_numero, bling_pedido_venda_id")
        .order("data_emissao", { ascending: false })
        .limit(500);
      if (error) throw error;
      const nfs = (data ?? []) as NfEmitida[];

      const ids = nfs.map((n) => n.id);
      let resolvidoMap = new Map<string, { pedido_ref: string | null; canal: "B2B" | "B2C" | null }>();
      if (ids.length > 0) {
        const { data: resolvido, error: errRes } = await (supabase as any)
          .from("vw_nf_pedido_resolvido")
          .select("nf_id, pedido_ref, canal")
          .in("nf_id", ids);
        if (errRes) throw errRes;
        for (const r of (resolvido ?? []) as Array<{ nf_id: string; pedido_ref: string | null; canal: "B2B" | "B2C" | null }>) {
          resolvidoMap.set(r.nf_id, { pedido_ref: r.pedido_ref, canal: r.canal });
        }
      }

      return nfs.map((n) => {
        const r = resolvidoMap.get(n.id);
        return { ...n, pedido_ref: r?.pedido_ref ?? null, canal: r?.canal ?? null };
      });
    },
  });
}
