/**
 * Mapa canônico de status de REMESSA (tabela `pedido_remessa`).
 *
 * Remessa é a unidade de despacho: nasce em toda ida ao Bling, mesmo sem split.
 * NÃO confundir com pedido-filho de split (linha em `pedidos` com
 * `split_de_pedido_id` preenchido) — esse é um pedido inteiro e é exibido pelo
 * card SplitsPedidoSection.
 *
 * `badge` mantém as classes originais do antigo RemessasSection (fundo + texto).
 * `dot` é a cor sólida usada no ponto de status das listagens compactas.
 */
export interface RemessaStatusMeta {
  label: string;
  badge: string;
  dot: string;
}

export const REMESSA_STATUS: Record<string, RemessaStatusMeta> = {
  aguardando_definicao: { label: "Aguardando definição", badge: "bg-muted/10 text-muted-foreground", dot: "bg-muted" },
  aguardando_estoque: { label: "Aguardando estoque", badge: "bg-warning/10 text-warning", dot: "bg-warning" },
  pronta_para_envio: { label: "Pronta para envio", badge: "bg-info/10 text-info", dot: "bg-info" },
  enviada_bling: { label: "Enviada ao Bling", badge: "bg-info/10 text-info", dot: "bg-info" },
  faturada: { label: "Faturada", badge: "bg-success/10 text-success", dot: "bg-success" },
  em_transporte: { label: "Em transporte", badge: "bg-info/10 text-info", dot: "bg-info" },
  entregue: { label: "Entregue", badge: "bg-success/10 text-success", dot: "bg-success" },
  cancelada: { label: "Cancelada", badge: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
};

export function remessaStatusMeta(status: string | null | undefined): RemessaStatusMeta {
  return (
    REMESSA_STATUS[status ?? ""] ?? {
      label: status ?? "Sem status",
      badge: "bg-muted text-muted-foreground",
      dot: "bg-muted-foreground",
    }
  );
}

