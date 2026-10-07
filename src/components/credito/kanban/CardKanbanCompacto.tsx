import { MoreHorizontal, Star, AlertTriangle, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format-currency";
import { nomeCanonico } from "@/lib/parceiros/nome";
import type { CardKanban, RaiaKanban } from "@/hooks/credito/useCobrancaKanban";
import { CANAL_LABEL, type ReguaEtapa } from "@/hooks/credito/useReguaFila";
import { fmtDiaMes, iniciais } from "./cores";

export function CardKanbanCompacto({
  card, etapa, acaoAtrasada, raias, onAbrir, onMover, onAtribuir, onAlterarData, onDragStart,
}: {
  card: CardKanban;
  etapa: ReguaEtapa | null;
  acaoAtrasada: boolean;
  raias: RaiaKanban[];
  onAbrir: () => void;
  onMover: (raia: RaiaKanban) => void;
  onAtribuir: () => void;
  onAlterarData: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const k = card._kanban;
  const atraso = card.dias_atraso ?? 0;
  /** Etapa com rótulo humano curto; o código cru nunca aparece na tela. */
  const chipEtapa = etapa
    ? `D+${etapa.dias_offset} · ${CANAL_LABEL[etapa.canal_sugerido] ?? etapa.canal_sugerido}`
    : null;
  const chipEtapaTooltip = etapa?.descricao_acao ?? null;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onAbrir}
      onKeyDown={(e) => { if (e.key === "Enter") onAbrir(); }}
      role="button"
      tabIndex={0}
      className="relative rounded-md border bg-card p-2.5 space-y-1.5 cursor-pointer hover:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {acaoAtrasada && (
        <span
          className="absolute -top-1 -left-1 h-2.5 w-2.5 rounded-full bg-destructive"
          title="Ação da régua atrasada"
          aria-label="Ação da régua atrasada"
        />
      )}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium truncate min-w-0">{nomeCanonico(card.parceiro_razao_social, "—")}</p>
        <div className="flex items-center gap-0.5 shrink-0">
          <span className="text-sm font-medium tabular-nums">{formatBRL(card.valor_efetivo)}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label="Mais ações"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Mover para…</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuLabel className="text-xs">Raias</DropdownMenuLabel>
                  {raias.map((r) => (
                    <DropdownMenuItem
                      key={r.codigo}
                      disabled={r.codigo === k.raia_codigo}
                      onSelect={() => onMover(r)}
                    >
                      {r.rotulo}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onAtribuir}>Atribuir pessoa</DropdownMenuItem>
              {k.exige_data_retorno && (
                <DropdownMenuItem onSelect={onAlterarData}>Alterar data de retorno</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground font-mono truncate min-w-0">
          {[card.pedido_id_externo || null, card.numero_titulo,
            card.total_parcelas > 1 ? `${card.numero_parcela}/${card.total_parcelas}` : null]
            .filter(Boolean).join(" · ")}
        </p>
        {atraso > 0 && (
          <Badge variant="destructive" className="text-[10px] shrink-0">há {atraso}d</Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {chipEtapa && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[10px]">{chipEtapa}</Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">{chipEtapaTooltip}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <Badge variant="secondary" className={cn("text-[10px] gap-1", !k.responsavel_user_id && "text-muted-foreground")}>
          {k.responsavel_user_id ? (
            <>
              <span className="font-semibold">{iniciais(k.responsavel_nome)}</span>
              <span className="truncate max-w-[110px]">{k.responsavel_nome}</span>
            </>
          ) : "sem responsável"}
        </Badge>
        {k.retorno_em && (
          <Badge variant="outline" className="text-[10px]">retorna {fmtDiaMes(k.retorno_em)}</Badge>
        )}
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          na raia há {k.dias_na_raia ?? 0}d
        </Badge>
        {card.vip_relacionamento && (
          <Badge variant="outline" className="text-[10px]"><Star className="h-3 w-3 mr-0.5" />VIP</Badge>
        )}
        {card.flag_bandeira_amarela && (
          <Badge variant="outline" className="text-[10px] border-warning text-warning">
            <AlertTriangle className="h-3 w-3 mr-0.5" />Bandeira
          </Badge>
        )}
        {card.flag_grupo_economico_inadimplente && (
          <Badge variant="outline" className="text-[10px] border-destructive text-destructive">
            <Users className="h-3 w-3 mr-0.5" />Grupo inadimplente
          </Badge>
        )}
      </div>
    </div>
  );
}
