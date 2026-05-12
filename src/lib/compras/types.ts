import type { Database } from "@/integrations/supabase/types";

export type PedidoCompraRow = Database["public"]["Tables"]["pedidos_compra"]["Row"];
export type PedidoCompraItemRow = Database["public"]["Tables"]["pedidos_compra_itens"]["Row"];
export type PedidoCompraAnexoRow = Database["public"]["Tables"]["pedidos_compra_anexos"]["Row"];
export type PedidoCompraStatus = Database["public"]["Enums"]["pedido_compra_status_enum"];
export type PedidoCompraItemStatus = Database["public"]["Enums"]["pedido_compra_item_status_enum"];
export type PedidoCompraAnexoTipo = Database["public"]["Enums"]["pedido_compra_anexo_tipo_enum"];

export interface PedidoCompraFull extends PedidoCompraRow {
  centros_custo: { id: string; codigo: string; nome: string } | null;
  linhas_investimento: { id: string; descricao: string } | null;
  parceiros_comerciais: { id: string; nome_fantasia: string | null; razao_social: string } | null;
  pedidos_compra_itens: PedidoCompraItemRow[];
  pedidos_compra_anexos: PedidoCompraAnexoRow[];
}

export interface NovoItem {
  descricao: string;
  quantidade: number;
  valor_estimado_unitario: number;
  urls?: string[];
  especificacao_tecnica?: string;
}

export interface ItemEdit {
  id?: string;
  descricao: string;
  quantidade: number;
  valor_estimado_unitario: number;
  urls: string[];
  especificacao_tecnica: string;
  ordem: number;
  _action?: "create" | "update" | "delete" | "keep";
}
