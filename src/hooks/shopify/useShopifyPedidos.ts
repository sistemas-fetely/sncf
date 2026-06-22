import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays, addDays } from "date-fns";

export type UrgenciaEnvio = "critico" | "atencao" | "ok" | null;
export type StatusEntrega = "vencido" | "em_transito" | "entregue" | null;

export interface ShopifyPedidoRow {
  shopify_id: string;
  order_name: string;
  financial_status: string;
  fulfillment_status: string | null;
  created_at_shopify: string;
  paid_at: string | null;
  fulfilled_at: string | null;
  cancelled_at: string | null;
  total: number;
  subtotal: number;
  shipping_cost: number;
  discount_amount: number;
  refunded_amount: number;
  payment_method: string | null;
  payment_method_raw: string | null;
  shipping_method: string | null;
  shipping_city: string | null;
  shipping_province: string | null;
  shipping_zip: string | null;
  wns_pedido_id: string | null;
  tracking_number: string | null;
  tracking_company: string | null;
  tracking_url: string | null;
  rastreio_status_atual: string | null;
  rastreio_entregue: boolean | null;
  sla_dias: number | null;
  urgency_envio: UrgenciaEnvio;
  dias_sem_envio: number | null;
  estimated_delivery: string | null;
  status_entrega: StatusEntrega;
}


export function useShopifyPedidos() {
  return useQuery({
    queryKey: ["shopify_pedidos"],
    queryFn: async (): Promise<ShopifyPedidoRow[]> => {
      const [pedidosRes, slasRes, rastreiosRes] = await Promise.all([
        supabase
          .from("shopify_pedidos")
          .select("*")
          .order("created_at_shopify", { ascending: false }),
        supabase.from("shopify_frete_sla").select("modalidade, dias_corridos, ativo"),
        supabase.from("pedido_rastreamento").select("codigo_rastreio, status_atual, entregue"),
      ]);

      if (pedidosRes.error) throw pedidosRes.error;
      if (slasRes.error) throw slasRes.error;
      if (rastreiosRes.error) throw rastreiosRes.error;

      const rastreioMap = new Map<string, { status_atual: string | null; entregue: boolean | null }>();
      (rastreiosRes.data ?? []).forEach((r) => {
        if (r.codigo_rastreio) {
          rastreioMap.set(r.codigo_rastreio, { status_atual: r.status_atual, entregue: r.entregue });
        }
      });


      const slaMap = new Map<string, number>();
      (slasRes.data ?? []).forEach((s) => {
        slaMap.set(s.modalidade.toLowerCase(), s.dias_corridos);
      });

      const agora = new Date();

      return (pedidosRes.data ?? []).map((p) => {
        const sla_dias = p.shipping_method ? slaMap.get(p.shipping_method.toLowerCase()) ?? null : null;

        let urgency_envio: UrgenciaEnvio = null;
        let dias_sem_envio: number | null = null;
        if (p.financial_status === "paid" && p.fulfillment_status === "unfulfilled") {
          const ref = p.paid_at ? new Date(p.paid_at) : null;
          if (ref) {
            dias_sem_envio = differenceInDays(agora, ref);
            if (dias_sem_envio >= 3) urgency_envio = "critico";
            else if (dias_sem_envio === 2) urgency_envio = "atencao";
            else urgency_envio = "ok";
          }
        }

        let estimated_delivery: string | null = null;
        let status_entrega: StatusEntrega = null;
        if (p.financial_status === "paid" && p.fulfillment_status === "fulfilled") {
          if (p.fulfilled_at && sla_dias != null) {
            const est = addDays(new Date(p.fulfilled_at), sla_dias);
            estimated_delivery = est.toISOString();
            status_entrega = est < agora ? "vencido" : "em_transito";
          } else {
            status_entrega = "em_transito";
          }
        }

        return {
          ...p,
          sla_dias,
          urgency_envio,
          dias_sem_envio,
          estimated_delivery,
          status_entrega,
        } as ShopifyPedidoRow;
      });
    },
  });
}

export interface TopSku {
  sku: string;
  product_name: string | null;
  total_quantity: number;
}

export function useShopifyTopSkus() {
  return useQuery({
    queryKey: ["shopify_top_skus"],
    queryFn: async (): Promise<TopSku[]> => {
      const { data, error } = await supabase
        .from("shopify_itens")
        .select("sku, product_name, quantity");
      if (error) throw error;

      const agg = new Map<string, TopSku>();
      (data ?? []).forEach((it) => {
        const key = it.sku ?? it.product_name ?? "—";
        const existente = agg.get(key);
        if (existente) {
          existente.total_quantity += it.quantity ?? 0;
        } else {
          agg.set(key, {
            sku: key,
            product_name: it.product_name,
            total_quantity: it.quantity ?? 0,
          });
        }
      });

      return Array.from(agg.values())
        .sort((a, b) => b.total_quantity - a.total_quantity)
        .slice(0, 10);
    },
  });
}
