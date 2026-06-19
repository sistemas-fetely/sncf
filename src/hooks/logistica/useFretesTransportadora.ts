import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FreteRow {
  id: string;
  transportadora_id: string;
  data_frete: string | null;
  tipo_frete: string | null;
  minuta: string | null;
  cte_numero: string | null;
  cte_serie: string | null;
  cte_emissao: string | null;
  nf_numero: string | null;
  referencia: string | null;
  doc_anterior: string | null;
  di_dta: string | null;
  hawb: string | null;
  mawb: string | null;
  remetente: string | null;
  remetente_cidade: string | null;
  remetente_uf: string | null;
  destinatario: string | null;
  destinatario_cidade: string | null;
  destinatario_uf: string | null;
  volumes: number | null;
  peso_real: number | null;
  peso_taxado: number | null;
  valor_nf: number | null;
  frete_total: number | null;
  frete_peso: number | null;
  valor_coleta: number | null;
  valor_entrega: number | null;
  ad_valorem: number | null;
  valor_redespacho: number | null;
  gris: number | null;
  itr: number | null;
  tde: number | null;
  valor_despacho: number | null;
  sec_cat: number | null;
  adicionais: number | null;
  outros_valores: number | null;
  valor_pedagio: number | null;
  valor_imposto: number | null;
  prazo_entrega: string | null;
  ocorrencia_texto: string | null;
  ocorrencia_data: string | null;
  ocorrencia_codigo: string | null;
  ocorrencia_label: string | null;
  classe: "entregue" | "em_transito" | "coletado" | "atencao" | string | null;
  eh_problema: boolean | null;
  eh_terminal: boolean | null;
  ordem_urgencia: number | null;
  pct_frete_nf: number | null;
  importado_arquivo: string | null;
  importado_em: string | null;
  atualizado_em: string | null;
}

export function useFretesTransportadora(transportadoraId: string | null) {
  return useQuery({
    queryKey: ["logistica", "fretes", transportadoraId],
    queryFn: async (): Promise<FreteRow[]> => {
      if (!transportadoraId) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_transp_fretes")
        .select("*")
        .eq("transportadora_id", transportadoraId)
        .order("ordem_urgencia", { ascending: true, nullsFirst: false })
        .order("prazo_entrega", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as FreteRow[];
    },
    enabled: !!transportadoraId,
  });
}
