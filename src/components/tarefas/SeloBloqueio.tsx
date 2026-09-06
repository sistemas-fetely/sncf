import { Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  /** quantos bloqueadores ainda estão abertos */
  abertos: number;
  className?: string;
}

/**
 * Selo de atenção: explica por que a tarefa não anda. Discreto, mas com a cor
 * de alerta — é a informação mais importante da linha, por isso vem primeiro.
 */
export function SeloBloqueio({ abertos, className }: Props) {
  if (!abertos || abertos < 1) return null;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive",
              className,
            )}
          >
            <Ban className="h-3 w-3 shrink-0" />
            Bloqueada por {abertos}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {abertos === 1
            ? "Espera 1 tarefa que ainda não foi resolvida"
            : `Espera ${abertos} tarefas que ainda não foram resolvidas`}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
