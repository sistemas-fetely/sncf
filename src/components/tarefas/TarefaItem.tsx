import { useState } from "react";
import { useTarefaAberta } from "@/hooks/tarefas/useTarefaAberta";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarClock, MoreHorizontal } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Tarefa, TarefaPrioridade } from "@/hooks/tarefas/useTarefas";
import { useAlterarStatusTarefa, useReagendarTarefa } from "@/hooks/tarefas/useTarefaMutations";
import { useProjetos } from "@/hooks/tarefas/useTarefasCatalogos";
import { useStatusRotulo } from "@/components/tarefas/detalhe/comuns";
import { LinkPedidoTarefa } from "@/components/tarefas/LinkPedidoTarefa";


const PRIORIDADE_CLASSE: Record<TarefaPrioridade, string> = {
  urgente: "border-destructive/40 bg-destructive/10 text-destructive",
  alta: "border-warning/40 bg-warning/10 text-warning",
  media: "border-warning/40 bg-warning/10 text-warning",
  baixa: "border-border bg-muted text-muted-foreground",
};

const PRIORIDADE_ROTULO: Record<TarefaPrioridade, string> = {
  urgente: "Urgente", alta: "Alta", media: "Média", baixa: "Baixa",
};

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props {
  tarefa: Tarefa;
  /** mostra a data de vencimento em vermelho (usado no grupo Atrasadas) */
  atrasada?: boolean;
  /** C/I não concluem nem reagendam a tarefa de outro R */
  somenteLeitura?: boolean;
  /** hierarquia visual já mostra a mãe — não repetir "Passo de:" */
  esconderMae?: boolean;
  /** texto secundário acima do título (ex.: título da mãe fora da lista) */
  subtitulo?: string;
}

export function TarefaItem({
  tarefa,
  atrasada = false,
  somenteLeitura = false,
  esconderMae = false,
  subtitulo,
}: Props) {
  const alterarStatus = useAlterarStatusTarefa();
  const reagendar = useReagendarTarefa();
  const { data: projetos } = useProjetos();
  const rotuloStatus = useStatusRotulo();
  const [calendarioAberto, setCalendarioAberto] = useState(false);
  const { abrir } = useTarefaAberta();

  const projeto = projetos?.find((p) => p.id === tarefa.projeto_id);
  const concluida = tarefa.status === "concluida";

  const reagendarPara = (dias: number) => {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    reagendar.mutate({ id: tarefa.id, data_limite: isoLocal(d) });
  };

  return (
    <div className="group flex items-start gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5 transition-colors hover:bg-accent/40">
      {somenteLeitura ? (
        <span className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      ) : (
        <Checkbox
          className="mt-0.5"
          checked={concluida}
          disabled={alterarStatus.isPending}
          onCheckedChange={(v) =>
            alterarStatus.mutate({ id: tarefa.id, status: v ? "concluida" : "pendente" })
          }
          aria-label={concluida ? "Reabrir tarefa" : "Concluir tarefa"}
        />
      )}

      <div
        className="min-w-0 flex-1 cursor-pointer"
        role="button"
        tabIndex={0}
        onClick={() => abrir(tarefa.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            abrir(tarefa.id);
          }
        }}
      >
        {subtitulo && (
          <p className="truncate text-[11px] text-muted-foreground">{subtitulo}</p>
        )}
        {!esconderMae && !subtitulo && tarefa.parent_id && tarefa.mae_titulo && (
          <p className="truncate text-[11px] text-muted-foreground">
            Passo de: {tarefa.mae_titulo}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("text-sm font-medium", concluida && "line-through text-muted-foreground")}>
            {tarefa.titulo}
          </span>
          <Badge variant="outline" className={cn("text-[10px] py-0", PRIORIDADE_CLASSE[tarefa.prioridade])}>
            {PRIORIDADE_ROTULO[tarefa.prioridade]}
          </Badge>
          <LinkPedidoTarefa acaoUrl={tarefa.acao_url} />
          {projeto && (
            <span className="text-[11px] text-muted-foreground" style={{ color: projeto.cor || undefined }}>
              #{projeto.nome}
            </span>
          )}
        </div>

        {tarefa.motivo_estado && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {rotuloStatus(tarefa.status)}: {tarefa.motivo_estado}
          </p>
        )}

        {tarefa.data_limite && (
          <div
            className={cn(
              "mt-1 flex items-center gap-1 text-[11px]",
              atrasada ? "text-destructive font-medium" : "text-muted-foreground"
            )}
          >
            <CalendarClock className="h-3 w-3 shrink-0" />
            {format(parseISO(tarefa.data_limite), "dd/MM/yyyy", { locale: ptBR })}
            {tarefa.hora_limite ? ` às ${tarefa.hora_limite.slice(0, 5)}` : ""}
          </div>
        )}
      </div>

      {somenteLeitura ? null : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 opacity-60 group-hover:opacity-100">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-xs">Reagendar</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => reagendarPara(0)}>Hoje</DropdownMenuItem>
            <DropdownMenuItem onClick={() => reagendarPara(1)}>Amanhã</DropdownMenuItem>
            <DropdownMenuItem onClick={() => reagendarPara(7)}>Próxima semana</DropdownMenuItem>
            <DropdownMenuSeparator />
            <Popover open={calendarioAberto} onOpenChange={setCalendarioAberto}>
              <PopoverTrigger asChild>
                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>Escolher data</DropdownMenuItem>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={tarefa.data_limite ? parseISO(tarefa.data_limite) : undefined}
                  onSelect={(d) => {
                    if (!d) return;
                    reagendar.mutate({ id: tarefa.id, data_limite: isoLocal(d) });
                    setCalendarioAberto(false);
                  }}
                  locale={ptBR}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => reagendar.mutate({ id: tarefa.id, data_limite: null })}>
              Tirar a data
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
