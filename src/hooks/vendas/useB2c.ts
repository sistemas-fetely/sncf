import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * FONTE-UNICA (Casa do B2C): todo contador de aba, card do pipeline e tabela
 * lê a MESMA view. Nada de derivar contagem de outro cache.
 * Pipeline -> vw_pipeline_b2c · Fila/Drawer -> vw_gestao_b2c_pedido
 * Carrinhos -> shopify_checkouts · Pós-venda -> devolucao (canal b2c)
 */

export interface PipelineB2cRow {
  estagio: string;
  rotulo: string | null;
  ordem: number | null;
  area: string | null;
  proxima_acao: string | null;
  visivel_no_pipeline: boolean | null;
  eh_final: boolean | null;
  eh_desvio: boolean | null;
  qtd: number | null;
  soma_valor: number | null;
  com_alerta: number | null;
  dias_medios: number | null;
}

export function usePipelineB2c() {
  return useQuery({
    queryKey: ["b2c-pipeline"],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<PipelineB2cRow[]> => {
      const { data, error } = await supabase
        .from("vw_pipeline_b2c")
        .select(
          "estagio, rotulo, ordem, area, proxima_acao, visivel_no_pipeline, eh_final, eh_desvio, qtd, soma_valor, com_alerta, dias_medios",
        )
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PipelineB2cRow[];
    },
  });
}

export interface PedidoB2cRow {
  shopify_id: string | null;
  order_name: string | null;
  pedido_id: string | null;
  id_externo: string | null;
  cliente: string | null;
  data_pedido: string | null;
  shipping_city: string | null;
  shipping_province: string | null;
  shipping_zip: string | null;
  total: number | null;
  subtotal: number | null;
  discount_amount: number | null;
  shipping_cost: number | null;
  estagio: string | null;
  estagio_rotulo: string | null;
  estagio_ordem: number | null;
  area_responsavel: string | null;
  proxima_acao: string | null;
  dias_no_estagio: number | null;
  alerta: string | null;
  na_carteira_ativa: boolean | null;
  eh_final: boolean | null;
  tem_nf: boolean | null;
  nf_refs: string | null;
  nf_data_emissao: string | null;
  tem_recebimento: boolean | null;
  liquido_mp: number | null;
  taxa_mp: number | null;
  situacao_financeira: string | null;
  xpm_codigo: string | null;
  xpm_estagio: string | null;
  xpm_farol_sla: string | null;
  xpm_horas_ciclo: number | null;
  tracking_number: string | null;
  tracking_company: string | null;
  tracking_url: string | null;
  rastreio_status: string | null;
  rastreio_entregue: boolean | null;
  entrega_prevista: string | null;
  shipping_method: string | null;
  payment_method: string | null;
  financial_status: string | null;
  fulfillment_status: string | null;
  paid_at: string | null;
  fulfilled_at: string | null;
  cancelled_at: string | null;
  refunded_amount: number | null;
  coerencia_status: string | null;
}

const CAMPOS_PEDIDO =
  "shopify_id, order_name, pedido_id, id_externo, cliente, data_pedido, shipping_city, shipping_province, shipping_zip, total, subtotal, discount_amount, shipping_cost, estagio, estagio_rotulo, estagio_ordem, area_responsavel, proxima_acao, dias_no_estagio, alerta, na_carteira_ativa, eh_final, tem_nf, nf_refs, nf_data_emissao, tem_recebimento, liquido_mp, taxa_mp, situacao_financeira, xpm_codigo, xpm_estagio, xpm_farol_sla, xpm_horas_ciclo, tracking_number, tracking_company, tracking_url, rastreio_status, rastreio_entregue, entrega_prevista, shipping_method, payment_method, financial_status, fulfillment_status, paid_at, fulfilled_at, cancelled_at, refunded_amount, coerencia_status";

export function usePedidosB2c() {
  return useQuery({
    queryKey: ["b2c-pedidos"],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<PedidoB2cRow[]> => {
      const { data, error } = await supabase
        .from("vw_gestao_b2c_pedido")
        .select(CAMPOS_PEDIDO)
        .order("data_pedido", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PedidoB2cRow[];
    },
  });
}

export interface ItemB2c {
  id: string;
  sku: string | null;
  product_name: string | null;
  quantity: number;
  unit_price: number;
}

export function useItensB2c(shopifyId: string | null) {
  return useQuery({
    queryKey: ["b2c-itens", shopifyId],
    enabled: !!shopifyId,
    queryFn: async (): Promise<ItemB2c[]> => {
      const { data, error } = await supabase
        .from("shopify_itens")
        .select("id, sku, product_name, quantity, unit_price")
        .eq("pedido_id", shopifyId!);
      if (error) throw error;
      return (data ?? []) as ItemB2c[];
    },
  });
}

export interface CarrinhoB2c {
  token: string;
  email: string | null;
  total_price: number | null;
  created_at_shopify: string | null;
  abandoned_checkout_url: string | null;
}

export function useCarrinhosAbandonados() {
  return useQuery({
    queryKey: ["b2c-carrinhos-abandonados"],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<CarrinhoB2c[]> => {
      const { data, error } = await supabase
        .from("shopify_checkouts")
        .select("token, email, total_price, created_at_shopify, abandoned_checkout_url")
        .is("completed_at", null)
        .order("created_at_shopify", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CarrinhoB2c[];
    },
  });
}

export interface DevolucaoB2c {
  id: string;
  numero: string;
  status: string;
  tipo: string;
  motivo_texto: string;
  motivo_categoria: string | null;
  valor_credito: number | null;
  criado_em: string;
  shopify_pedido_id: string | null;
  pedido_id: string | null;
}

export function useDevolucoesB2c() {
  return useQuery({
    queryKey: ["b2c-devolucoes"],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<DevolucaoB2c[]> => {
      const { data, error } = await supabase
        .from("devolucao")
        .select(
          "id, numero, status, tipo, motivo_texto, motivo_categoria, valor_credito, criado_em, shopify_pedido_id, pedido_id",
        )
        .eq("canal", "b2c")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DevolucaoB2c[];
    },
  });
}
