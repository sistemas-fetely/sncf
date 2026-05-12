import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  FilePlus,
  Send,
  Truck,
  XCircle,
  ShoppingBag,
  Trash2,
  CheckCircle2,
  Ban,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTimelinePedido } from "@/hooks/compras/useTimelinePedido";
import { useComentarPedido } from "@/hooks/compras/useComentarPedido";
import { ComentarioCard } from "./ComentarioCard";
import type { EventoPedidoTipo, TimelineEventoItem } from "@/lib/compras/timeline-types";

const fmtBRL = (v: number | undefined) =>
  v == null
    ? ""
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

type EventoCfg = { icon: LucideIcon; label: string; color: string };

const eventoConfig: Record<EventoPedidoTipo, EventoCfg | null> = {
  pedido_criado: { icon: FilePlus, label: "criou o pedido", color: "text-muted-foreground" },
  pedido_enviado: { icon: Send, label: "enviou o pedido", color: "text-primary" },
  pedido_pego: { icon: Truck, label: "iniciou a compra", color: "text-primary" },
  item_cancelado: {
    icon: XCircle,
    label: "cancelou um item",
    color: "text-destructive",
  },
  compra_registrada: {
    icon: ShoppingBag,
    label: "registrou compra",
    color: "text-success",
  },
  compra_excluida: { icon: Trash2, label: "excluiu compra", color: "text-destructive" },
  pedido_finalizado_comprado: {
    icon: CheckCircle2,
    label: "Pedido finalizado como Comprado",
    color: "text-success",
  },
  pedido_finalizado_cancelado: {
    icon: Ban,
    label: "Pedido finalizado como Cancelado",
    color: "text-destructive",
  },
  pedido_cancelado_total: {
    icon: Ban,
    label: "cancelou o pedido",
    color: "text-destructive",
  },
  comentario_adicionado: null,
  comentario_editado: null,
  comentario_excluido: null,
};

function renderEventoDetalhes(item: TimelineEventoItem): string | null {
  const p = (item.payload || {}) as Record<string, unknown>;
  const num = (k: string) => (typeof p[k] === "number" ? (p[k] as number) : undefined);
  const str = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : undefined);
  switch (item.tipo) {
    case "pedido_enviado":
      return num("itens_total") ? `(${num("itens_total")} itens)` : null;
    case "item_cancelado": {
      const desc = str("item_descricao");
      const motivo = str("motivo");
      if (desc) return `"${desc}" — motivo: "${motivo || "—"}"`;
      return motivo ? `Motivo: "${motivo}"` : null;
    }
    case "compra_registrada":
      return num("valor_total")
        ? `${fmtBRL(num("valor_total"))} em ${num("parcelas") || 1} parcela(s), cobrindo ${
            num("itens_cobertos") || 0
          } item(s)`
        : null;
    case "compra_excluida":
      return str("motivo")
        ? `Motivo: "${str("motivo")}". ${num("cprs_canceladas") || 0} CPRs canceladas, ${
            num("itens_reabertos") || 0
          } itens reabertos.`
        : null;
    case "pedido_finalizado_comprado":
    case "pedido_finalizado_cancelado":
      return num("itens_comprados") != null
        ? `${num("itens_comprados")} item(s) comprado(s), ${
            num("itens_cancelados") || 0
          } cancelado(s)`
        : null;
    case "pedido_cancelado_total":
      return str("motivo") ? `Motivo: "${str("motivo")}"` : null;
    default:
      return null;
  }
}

interface Props {
  pedidoId: string;
}

export function TimelinePedido({ pedidoId }: Props) {
  const { data: items = [], isLoading } = useTimelinePedido(pedidoId);
  const comentar = useComentarPedido();
  const [novoComentario, setNovoComentario] = useState("");

  const handleComentar = async () => {
    const txt = novoComentario.trim();
    if (!txt) return;
    await comentar.mutateAsync({ pedido_id: pedidoId, conteudo: txt });
    setNovoComentario("");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">
          Nenhum evento ainda neste pedido.
        </p>
      )}

      <div className="space-y-3">
        {items.map((item) => {
          if (item.kind === "comentario") {
            return <ComentarioCard key={item.id} item={item} pedidoId={pedidoId} />;
          }

          const cfg = eventoConfig[item.tipo];
          if (!cfg) return null;
          const Icon = cfg.icon;
          const detalhes = renderEventoDetalhes(item);
          const isPedidoLevel = item.tipo.startsWith("pedido_finalizado");

          return (
            <div key={item.id} className="flex gap-3 items-start text-sm">
              <div
                className={`h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 ${cfg.color}`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <p>
                  {!isPedidoLevel && (
                    <span className="font-medium">{item.usuario_nome} </span>
                  )}
                  <span className={isPedidoLevel ? `font-medium ${cfg.color}` : ""}>
                    {cfg.label}
                  </span>
                  {detalhes && (
                    <span className="text-muted-foreground"> · {detalhes}</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {format(new Date(item.created_at), "dd MMM yyyy, HH:mm", {
                    locale: ptBR,
                  })}
                  {" · "}
                  {formatDistanceToNow(new Date(item.created_at), {
                    addSuffix: true,
                    locale: ptBR,
                  })}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-3 border-t">
        <Textarea
          value={novoComentario}
          onChange={(e) => setNovoComentario(e.target.value)}
          placeholder="Adicione um comentário..."
          rows={2}
          maxLength={5000}
        />
        <div className="flex justify-end mt-2">
          <Button
            size="sm"
            onClick={handleComentar}
            disabled={!novoComentario.trim() || comentar.isPending}
            style={{ backgroundColor: "#1A4A3A", color: "white" }}
          >
            {comentar.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Comentar
          </Button>
        </div>
      </div>
    </div>
  );
}
