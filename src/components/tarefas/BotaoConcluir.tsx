import { Check } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface BotaoConcluirProps {
  concluida: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

/** Controle único de conclusão usado nas listas, no board e nas fichas. */
export function BotaoConcluir({
  concluida,
  onClick,
  disabled,
  className,
  ariaLabel,
}: BotaoConcluirProps) {
  const rotulo = ariaLabel ?? (concluida ? "Reabrir tarefa" : "Concluir tarefa");

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={rotulo}
            disabled={disabled}
            onClick={onClick}
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50",
              className,
            )}
          >
            <span
              className={cn(
                "flex h-[18px] w-[18px] items-center justify-center rounded-full border transition-colors duration-200",
                concluida
                  ? "border-success bg-success text-success-foreground"
                  : "border-muted-foreground/40 bg-transparent text-transparent hover:border-muted-foreground/70 hover:text-muted-foreground/70",
              )}
            >
              <Check className="h-3 w-3 stroke-[2.5]" />
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent>{rotulo}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}