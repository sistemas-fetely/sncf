import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Props {
  regraNome?: string | null;
  compact?: boolean;
  className?: string;
}

export function BadgePreAprovado({ regraNome, compact, className }: Props) {
  const texto = compact
    ? "Pré-aprovado"
    : regraNome
      ? `Pré-aprovado por ${regraNome}`
      : "Pré-aprovado";

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100",
              "dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
              compact && "text-[10px] py-0 px-1.5",
              className,
            )}
          >
            <Sparkles className={cn("h-3 w-3", compact && "h-2.5 w-2.5")} />
            {texto}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs">
            Esta análise foi pré-aprovada automaticamente
            {regraNome ? ` pela regra "${regraNome}"` : ""}. Joseph pode confirmar com 1 clique
            ou seguir o fluxo normal.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
