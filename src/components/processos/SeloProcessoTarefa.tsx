import { ListChecks } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { fmtPrazoCurto, type ProcessoTarefa } from "@/hooks/processos/useProcessoTarefas";
import { cn } from "@/lib/utils";

export function SeloProcessoTarefa({ tarefas }: { tarefas: ProcessoTarefa[] }) {
  if (tarefas.length === 0) return null;
  const linhas = tarefas.map((t) => `${t.passo_nome} · ${t.area_nome ?? "Sistema"} · prazo ${fmtPrazoCurto(t.prazo_data)}${t.atrasada ? " · atrasada" : ""}`);
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span role="img" tabIndex={0} aria-label={linhas.join("; ")}
            className={cn("ml-1 inline-flex h-3.5 shrink-0 items-center gap-0.5 whitespace-nowrap align-middle", tarefas.some((t) => t.atrasada) ? "text-destructive" : "text-muted-foreground")}>
            <ListChecks className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {tarefas.length > 1 && <span className="text-[10px] leading-none" aria-hidden="true">{tarefas.length}</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[calc(100vw-2rem)] text-xs">
          {linhas.map((linha, i) => <div key={tarefas[i].tarefa_id}>{linha}</div>)}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}