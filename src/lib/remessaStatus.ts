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
  aguardando_definicao: { label: "Aguardando definição", badge: "bg-gray-100 text-gray-700", dot: "bg-gray-400" },
  aguardando_estoque: { label: "Aguardando estoque", badge: "bg-yellow-100 text-yellow-800", dot: "bg-yellow-500" },
  pronta_para_envio: { label: "Pronta para envio", badge: "bg-blue-100 text-blue-800", dot: "bg-blue-500" },
  enviada_bling: { label: "Enviada ao Bling", badge: "bg-purple-100 text-purple-800", dot: "bg-purple-500" },
  faturada: { label: "Faturada", badge: "bg-green-100 text-green-800", dot: "bg-green-500" },
  em_transporte: { label: "Em transporte", badge: "bg-indigo-100 text-indigo-800", dot: "bg-indigo-500" },
  entregue: { label: "Entregue", badge: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
  cancelada: { label: "Cancelada", badge: "bg-red-100 text-red-800", dot: "bg-red-500" },
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

