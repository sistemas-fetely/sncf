import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VendaProduto {
  mes: string;                       // 'YYYY-MM-01'
  sku_raiz: string;
  nome_produto: string;
  colecao: string | null;
  cor_nome: string | null;
  quantidade_venda: number | null;
  valor_venda: number | null;
  quantidade_outros: number | null;
  valor_outros: number | null;
  quantidade_total: number | null;
  valor_total: number | null;
  nfs_distintas: number;
  tem_cfop_nao_classificado: boolean;
  sku_sem_cadastro: boolean;
  cfops: string[];
}

export function useVendasProduto() {
  return useQuery({
    queryKey: ["vendas_produto"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_vendas_produto")
        .select("*")
        .order("valor_venda", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as VendaProduto[];
    },
  });
}
