export type EventoPedidoTipo =
  | "pedido_criado"
  | "pedido_enviado"
  | "pedido_pego"
  | "item_cancelado"
  | "compra_registrada"
  | "compra_excluida"
  | "pedido_finalizado_comprado"
  | "pedido_finalizado_cancelado"
  | "pedido_cancelado_total"
  | "comentario_adicionado"
  | "comentario_editado"
  | "comentario_excluido";

export interface EventoPedidoRow {
  id: string;
  pedido_id: string;
  tipo: EventoPedidoTipo;
  payload: Record<string, unknown>;
  usuario_id: string | null;
  created_at: string;
}

export interface ComentarioPedidoRow {
  id: string;
  pedido_id: string;
  autor_id: string;
  conteudo: string;
  editado_em: string | null;
  excluido_em: string | null;
  excluido_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimelineEventoItem {
  kind: "evento";
  id: string;
  created_at: string;
  tipo: EventoPedidoTipo;
  payload: Record<string, unknown>;
  usuario_id: string | null;
  usuario_nome: string;
}

export interface TimelineComentarioItem {
  kind: "comentario";
  id: string;
  created_at: string;
  autor_id: string;
  autor_nome: string;
  conteudo: string;
  editado_em: string | null;
  excluido_em: string | null;
  pode_editar: boolean;
  pode_excluir: boolean;
}

export type TimelineItem = TimelineEventoItem | TimelineComentarioItem;
