import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FaturamentoMensal {
  mes: string;
  canal: string;
  nfs: number | null;
  itens: number | null;
  unidades: number | null;
  receita_produto: number | null;
  receita_frete: number | null;
  receita_total: number | null;
  cmv: number | null;
  icms: number | null;
  margem_produto: number | null;
  custo_frete_pago: number | null;
  resultado_frete: number | null;
  margem_sem_frete_pago: number | null;
  margem_com_frete_pago: number | null;
  ticket_medio: number | null;
  valor_nao_receita: number | null;
  nfs_divergencia_canal: number | null;
  nfs_sem_pedido: number | null;
  itens_sem_custo: number | null;
  itens_cfop_orfao: number | null;
  lancamentos_frete: number | null;
  somente_frete: boolean | null;
}

export interface FaturamentoNf {
  nf_id: string;
  nf_ref: string | null;
  data_emissao: string | null;
  mes: string;
  pedido_venda_id: string | null;
  pedido_ref: string | null;
  canal: string | null;
  canal_fiscal: string | null;
  divergencia_canal: boolean | null;
  sem_canal: boolean | null;
  cliente: string | null;
  cliente_cnpj: string | null;
  uf: string | null;
  cidade: string | null;
  cfops: string | null;
  naturezas: string | null;
  itens: number | null;
  unidades: number | null;
  receita_produto: number | null;
  receita_frete: number | null;
  receita_total: number | null;
  cmv: number | null;
  icms: number | null;
  margem: number | null;
  margem_pct: number | null;
  tem_nao_venda: boolean | null;
  valor_nao_receita: number | null;
  itens_sem_custo: number | null;
  nf_valor_nota: number | null;
  custo_safra: string | null;
}

export interface FaturamentoProduto {
  mes: string;
  canal: string | null;
  sku: string | null;
  produto: string | null;
  colecao: string | null;
  linha: string | null;
  grupo: string | null;
  cor_nome: string | null;
  sku_sem_cadastro: boolean | null;
  sem_custo: boolean | null;
  custo_unit: number | null;
  custo_safra: string | null;
  unidades: number | null;
  receita_produto: number | null;
  receita_frete: number | null;
  cmv: number | null;
  icms: number | null;
  margem: number | null;
  margem_pct: number | null;
  preco_medio_un: number | null;
  nfs: number | null;
  clientes: number | null;
}

export interface FaturamentoPedido {
  chave: string;
  pedido_ref: string | null;
  mes: string;
  sem_pedido: boolean | null;
  pedido_venda_id: string | null;
  nfs: number | null;
  nfs_lista: string | null;
  primeira_nf: string | null;
  ultima_nf: string | null;
  canal: string | null;
  cfops: string | null;
  divergencia_canal: boolean | null;
  sem_canal: boolean | null;
  cliente: string | null;
  cliente_cnpj: string | null;
  uf: string | null;
  cidade: string | null;
  unidades: number | null;
  receita_produto: number | null;
  receita_frete: number | null;
  receita_total: number | null;
  cmv: number | null;
  icms: number | null;
  margem: number | null;
  margem_pct: number | null;
  preco_medio_un: number | null;
  itens_sem_custo: number | null;
  valor_nao_receita: number | null;
  valor_nota: number | null;
  custo_safra: string | null;
  multi_nf: boolean | null;
}

const COLS_MENSAL =
  "mes, canal, nfs, itens, unidades, receita_produto, receita_frete, receita_total, cmv, icms, margem_produto, custo_frete_pago, resultado_frete, margem_sem_frete_pago, margem_com_frete_pago, ticket_medio, valor_nao_receita, nfs_divergencia_canal, nfs_sem_pedido, itens_sem_custo, itens_cfop_orfao, lancamentos_frete, somente_frete";


const COLS_NF =
  "nf_id, nf_ref, data_emissao, mes, pedido_venda_id, pedido_ref, canal, canal_fiscal, divergencia_canal, sem_canal, cliente, cliente_cnpj, uf, cidade, cfops, naturezas, itens, unidades, receita_produto, receita_frete, receita_total, cmv, icms, margem, margem_pct, tem_nao_venda, valor_nao_receita, itens_sem_custo, nf_valor_nota, custo_safra";

const COLS_PRODUTO =
  "mes, canal, sku, produto, colecao, linha, grupo, cor_nome, sku_sem_cadastro, sem_custo, custo_unit, custo_safra, unidades, receita_produto, receita_frete, cmv, icms, margem, margem_pct, preco_medio_un, nfs, clientes";

export function useFaturamentoMensal() {
  return useQuery({
    queryKey: ["faturamento-mensal"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_faturamento_mensal")
        .select(COLS_MENSAL)
        .order("mes", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FaturamentoMensal[];
    },
  });
}

export function useFaturamentoNf(mes: string) {
  return useQuery({
    queryKey: ["faturamento-nf", mes],
    enabled: !!mes,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_faturamento_nf")
        .select(COLS_NF)
        .eq("mes", mes);
      if (error) throw error;
      return (data ?? []) as FaturamentoNf[];
    },
  });
}

export function useFaturamentoProduto(mes: string) {
  return useQuery({
    queryKey: ["faturamento-produto", mes],
    enabled: !!mes,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_faturamento_produto")
        .select(COLS_PRODUTO)
        .eq("mes", mes);
      if (error) throw error;
      return (data ?? []) as FaturamentoProduto[];
    },
  });
}

const COLS_PEDIDO =
  "chave, pedido_ref, mes, sem_pedido, pedido_venda_id, nfs, nfs_lista, primeira_nf, ultima_nf, canal, cfops, divergencia_canal, sem_canal, cliente, cliente_cnpj, uf, cidade, unidades, receita_produto, receita_frete, receita_total, cmv, icms, margem, margem_pct, preco_medio_un, itens_sem_custo, valor_nao_receita, valor_nota, custo_safra, multi_nf";

export function useFaturamentoPedido(mes: string) {
  return useQuery({
    queryKey: ["faturamento-pedido", mes],
    enabled: !!mes,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_faturamento_pedido")
        .select(COLS_PEDIDO)
        .eq("mes", mes);
      if (error) throw error;
      return (data ?? []) as FaturamentoPedido[];
    },
  });
}
