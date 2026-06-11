import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WnsFase = {
  wns_id: number;
  codigo: string;
  descricao: string;
  sequencia: number;
  icone: string | null;
  ativo: boolean;
};

export type WnsTipoPedido = {
  codigo: number;
  descricao: string;
  compoe_receita: boolean;
  movimenta_estoque: boolean;
  ativo: boolean;
};

export type WnsPedido = {
  pedidowns: number;
  n_pedido_cliente: string | null;
  tipo_pedido_codigo: number | null;
  filial: number | null;
  cliente_wns_id: number | null;
  cliente_nome: string | null;
  cpf_cnpj: string | null;
  cidade: string | null;
  estado: string | null;
  evento_atual_wns_id: number | null;
  total_remessas: number | null;
  total_linhas: number | null;
  total_quantidade: number | null;
  valor_total: number | null;
  notas_fiscais: number[] | null;
  primeira_data: string | null;
  ultima_data: string | null;
  updated_at: string | null;
};

export function useWnsFases() {
  return useQuery({
    queryKey: ["wns-fases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wns_fases_xpm")
        .select("*")
        .eq("ativo", true)
        .order("sequencia");
      if (error) throw error;
      return (data ?? []) as WnsFase[];
    },
  });
}

export function useWnsTiposPedido() {
  return useQuery({
    queryKey: ["wns-tipos-pedido"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wns_tipos_pedido")
        .select("*")
        .order("codigo");
      if (error) throw error;
      return (data ?? []) as WnsTipoPedido[];
    },
  });
}

export function useWnsPedidos() {
  return useQuery({
    queryKey: ["wns-pedidos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wns_pedidos")
        .select("*")
        .order("ultima_data", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as WnsPedido[];
    },
  });
}

export type WnsLinha = {
  pedidowns: number;
  prefaturamento_xpm: number;
  evento_wns_id: number | null;
  evento_xpm_raw: string | null;
  nota_numero: number | null;
  data_pre: string | null;
  sku: string;
  quantidade: number | null;
  preco: number | null;
  total: number | null;
};

export function useWnsLinhasDoPedido(pedidowns: number | null) {
  return useQuery({
    queryKey: ["wns-linhas-pedido", pedidowns],
    enabled: pedidowns != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wns_linhas")
        .select(
          "pedidowns, prefaturamento_xpm, evento_wns_id, evento_xpm_raw, nota_numero, data_pre, sku, quantidade, preco, total"
        )
        .eq("pedidowns", pedidowns!);
      if (error) throw error;
      return (data ?? []) as WnsLinha[];
    },
  });
}
