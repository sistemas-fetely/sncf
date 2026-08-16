import { Badge } from "@/components/ui/badge";
import { Crown, Clock, AlertTriangle, Sparkles, PauseCircle, Bell } from "lucide-react";
import { ESTAGIO_LABELS } from "@/types/pedido";
import type { EstagioPedido, PedidoFilaItem } from "@/types/pedido";
import { cn } from "@/lib/utils";

/** Cores por estágio — fonte única de verdade pra Badge + barra do pipeline. */
export const ESTAGIO_CORES: Record<EstagioPedido, string> = {
  recebido: "bg-muted",
  em_analise_credito: "bg-info",
  
  cobranca: "bg-info",
  aguardando_pagamento: "bg-warning",
  pre_separacao: "bg-warning",
  pre_faturamento: "bg-warning",
  aguardando_estoque: "bg-warning",
  em_separacao: "bg-info",
  faturado: "bg-info",
  em_transporte: "bg-info",
  entregue: "bg-success",
  cancelado: "bg-destructive",
  recuperacao_venda: "bg-warning",
};

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
      {p.atencao_nivel === 'pausa' && (
        <Badge className="gap-1 bg-destructive text-white border-0">
          <PauseCircle className="h-3 w-3" />
          Pausado
        </Badge>
      )}
      {p.atencao_nivel === 'aviso' && (
        <Badge className="gap-1 bg-warning text-white border-0">
          <Bell className="h-3 w-3" />
          Aviso
        </Badge>
      )}
      {p.bandeira_vermelha && (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          Bandeira
        </Badge>
      )}
      {p.categoria_ka && (
        <Badge className="gap-1 bg-warning text-white border-0">
          <Crown className="h-3 w-3" />
          KA {p.categoria_ka}
        </Badge>
      )}
      {p.tipo_pagamento === "a_vista" && (
        <Badge variant="outline" className="border-success/40 text-success">
          À vista
        </Badge>
      )}
      {p.tipo_pagamento === "a_prazo" && (
        <Badge variant="outline" className="border-info/40 text-info">
          A prazo
        </Badge>
      )}
      {p.sla_estourado && (
        <Badge className="gap-1 bg-destructive text-white border-0">
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

export function NaturezaOperacaoBadge({ codigo, nome }: { codigo: string | null; nome: string | null }) {
  if (!codigo || codigo === "venda") return null;
  const estilos: Record<string, string> = {
    bonificacao: "bg-info/10 text-info border-info/40",
    transferencia_interna: "bg-info/10 text-info border-info/40",
    venda_a_custo: "bg-info/10 text-info border-info/40",
  };
  return (
    <Badge variant="outline" className={cn("text-[10px] gap-1", estilos[codigo] ?? "")}>
      {nome ?? codigo}
    </Badge>
  );
}
