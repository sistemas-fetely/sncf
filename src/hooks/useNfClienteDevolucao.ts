import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { nfClienteConfirmada, type VinculoNfCliente } from "@/lib/devolucao/nfCliente";

// The generated relationships for this large schema recurse during nested selects.
const sb = supabase as any;

export function useNfClienteDevolucao(devolucaoId: string) {
  return useQuery({
    queryKey: ["devolucao-nf-cliente", devolucaoId],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data: d, error } = await supabase.from("devolucao").select("nf_original_id").eq("id", devolucaoId).single();
      if (error) throw error;
      const filtro = d.nf_original_id ? `devolucao_id.eq.${devolucaoId},nf_saida_id.eq.${d.nf_original_id}` : `devolucao_id.eq.${devolucaoId}`;
      const { data, error: erroVinculo } = await sb.from("nf_devolucao_vinculo")
        .select("devolucao_id,nf_saida_id,status,classe,nfs_stage(nf_numero)")
        .eq("status", "confirmado").eq("classe", "devolucao_comercial").or(filtro)
        .order("confirmado_em", { ascending: false });
      if (erroVinculo) throw erroVinculo;
      return nfClienteConfirmada((data ?? []) as VinculoNfCliente[], devolucaoId, d.nf_original_id);
    },
  });
}