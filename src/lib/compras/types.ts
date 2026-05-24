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
  status?: "pendente" | "comprado" | "cancelado";
  cancelamento_motivo?: string | null;
}

export interface ItemCobertoInput {
  pedido_item_id: string;
  quantidade_real: number;
  valor_unitario_real: number;
}

export interface RegistrarCompraInput {
  pedido_id: string;
  plano_contas_id: string | null;
  parceiro_id: string;
  valor_total: number;
  data_compra: string;
  parcelas_count: number;
  primeira_parcela_data: string;
  intervalo_dias: number;
  periodicidade: "dias" | "meses";
  meio_pagamento_id: string;
  observacao?: string | null;
  itens: ItemCobertoInput[];
}

// =========================================================================
// B-42 — Linhas heterogêneas e workflow rascunho/finalizada
// =========================================================================

export type TipoLinha = "produto" | "frete" | "servico" | "extra" | "desconto";
export type StatusLinha = "comprada" | "nao_comprada" | "substituida";
export type StatusAlvo = "rascunho" | "finalizada";

export interface LinhaCompra {
  _local_id: string;
  tipo_linha: TipoLinha;
  status_linha: StatusLinha;
  pedido_item_id: string | null;
  substitui_pedido_item_id: string | null;
  descricao_livre: string | null;
  quantidade_real: number;
  valor_unitario_real: number;
  _descricao_exibicao: string;
  _valor_total: number;
}

export interface LinhaCompraPersist {
  tipo_linha: TipoLinha;
  status_linha: StatusLinha;
  pedido_item_id: string | null;
  substitui_pedido_item_id: string | null;
  descricao_livre: string | null;
  quantidade_real: number;
  valor_unitario_real: number;
}

export interface RegistrarCompraInputV2 {
  pedido_id: string;
  status_alvo: StatusAlvo;
  linhas: LinhaCompraPersist[];
  parceiro_id: string;
  meio_pagamento_id: string;
  data_compra: string;
  parcelas_count: number;
  primeira_parcela_data: string;
  intervalo_dias: number;
  periodicidade: "dias" | "meses";
  plano_contas_id: string | null;
  observacao: string | null;
  compra_id?: string | null;
  parceiro_id_pedido_original?: string | null;
}

export interface RegistrarCompraResultV2 {
  compra_id: string;
  pedido_id: string;
  parcela_grupo_id: string;
  status: "rascunho" | "finalizada";
  valor_total: number;
  cprs_geradas: number;
}
