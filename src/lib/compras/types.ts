import type { Database } from "@/integrations/supabase/types";

export type PedidoCompraRow = Database["public"]["Tables"]["pedidos_compra"]["Row"];
export type PedidoCompraItemRow = Database["public"]["Tables"]["pedidos_compra_itens"]["Row"];
export type PedidoCompraAnexoRow = Database["public"]["Tables"]["pedidos_compra_anexos"]["Row"];
export type PedidoCompraStatus = Database["public"]["Enums"]["pedido_compra_status_enum"];
export type PedidoCompraItemStatus = Database["public"]["Enums"]["pedido_compra_item_status_enum"];
export type PedidoCompraAnexoTipo = Database["public"]["Enums"]["pedido_compra_anexo_tipo_enum"];

export type CompraRegistradaRow = Database["public"]["Tables"]["compras_registradas"]["Row"];
export type CompraRegistradaItemRow = Database["public"]["Tables"]["compras_registradas_itens"]["Row"];
export type CompraRegistradaAnexoRow = Database["public"]["Tables"]["compras_registradas_anexos"]["Row"];
export type CompraRegistradaStatus = Database["public"]["Enums"]["compra_registrada_status_enum"];
export type CompraAnexoTipo = Database["public"]["Enums"]["compra_anexo_tipo_enum"];

export interface PedidoCompraFull extends PedidoCompraRow {
  centros_custo: { id: string; codigo: string; nome: string } | null;
  linhas_investimento: { id: string; descricao: string } | null;
  parceiros_comerciais: { id: string; nome_fantasia: string | null; razao_social: string } | null;
  pedidos_compra_itens: PedidoCompraItemRow[];
  pedidos_compra_anexos: PedidoCompraAnexoRow[];
}

export interface CompraRegistradaFull extends CompraRegistradaRow {
  parceiros_comerciais: { id: string; razao_social: string; nome_fantasia: string | null } | null;
  plano_contas: { id: string; nome: string; codigo: string } | null;
  formas_pagamento: { id: string; nome: string; tipo: string } | null;
  compras_registradas_itens: (CompraRegistradaItemRow & {
    pedidos_compra_itens: { id: string; descricao: string } | null;
  })[];
  compras_registradas_anexos: CompraRegistradaAnexoRow[];
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

export interface ItemCobertoInput {
  pedido_item_id: string;
  quantidade_real: number;
  valor_unitario_real: number;
}

export interface RegistrarCompraInput {
  pedido_id: string;
  conta_id: string;
  parceiro_id: string;
  valor_total: number;
  data_compra: string;
  parcelas_count: number;
  primeira_parcela_data: string;
  intervalo_dias: number;
  meio_pagamento_id?: string | null;
  observacao?: string | null;
  itens: ItemCobertoInput[];
}
