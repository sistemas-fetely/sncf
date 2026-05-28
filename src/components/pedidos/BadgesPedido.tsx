import { Badge } from "@/components/ui/badge";
import { Shield, Crown, Clock, AlertTriangle, Sparkles } from "lucide-react";
import { ESTAGIO_LABELS, ESTAGIO_CORES } from "@/types/pedido";
import type { EstagioPedido, PedidoFilaItem } from "@/types/pedido";
import { cn } from "@/lib/utils";

export function EstagioBadge({ estagio }: { estagio: EstagioPedido }) {
  return (
    <Badge className={cn("text-white border-0", ESTAGIO_CORES[estagio])}>
      {ESTAGIO_LABELS[estagio]}
    </Badge>
  );
}

export function BadgesContextuaisPedido({ p }: { p: PedidoFilaItem }) {
  return (
    <div className="flex flex-wrap gap-1">
      {p.bandeira_vermelha && (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          Bandeira
        </Badge>
      )}
      {p.categoria_ka && (
        <Badge className="gap-1 bg-amber-500 text-white border-0">
          <Crown className="h-3 w-3" />
          KA {p.categoria_ka}
        </Badge>
      )}
      {p.tipo_pagamento === "a_vista" && (
        <Badge variant="outline" className="border-emerald-500 text-emerald-700 dark:text-emerald-400">
          À vista
        </Badge>
      )}
      {p.tipo_pagamento === "a_prazo" && (
        <Badge variant="outline" className="border-purple-500 text-purple-700 dark:text-purple-400">
          A prazo
        </Badge>
      )}
      {p.sla_estourado && (
        <Badge className="gap-1 bg-red-500 text-white border-0">
          <Clock className="h-3 w-3" />
          24h+
        </Badge>
      )}
      {p.prioridade_score > 0 && (
        <Badge variant="outline" className="gap-1">
          <Sparkles className="h-3 w-3" />
          {Math.round(p.prioridade_score)}
        </Badge>
      )}
    </div>
  );
}

export function FormatoIdade({ minutos }: { minutos: number }) {
  if (minutos < 60) return <>{Math.round(minutos)} min</>;
  if (minutos < 1440) return <>{Math.floor(minutos / 60)}h {Math.round(minutos % 60)}m</>;
  return <>{Math.floor(minutos / 1440)}d {Math.floor((minutos % 1440) / 60)}h</>;
}
