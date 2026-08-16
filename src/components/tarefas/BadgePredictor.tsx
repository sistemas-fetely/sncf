import { Sparkles } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  tamanho?: "sm" | "md";
}

/**
 * Badge teaser — informa que a análise inteligente de cumprimento
 * de tarefas (Predictor) está em desenvolvimento. Hover mostra contexto.
 */
export function BadgePredictor({ tamanho = "sm" }: Props) {
  const isSmall = tamanho === "sm";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-1 rounded-full border border-dashed border-info/40 bg-info/10 text-info cursor-help ${
              isSmall ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1"
            }`}
          >
            <Sparkles className={isSmall ? "h-2.5 w-2.5" : "h-3 w-3"} />
            Análise IA · em breve
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs">
            Em breve, uma análise inteligente vai prever o risco de atraso da pessoa
            com base na carga atual, SLA histórico, férias e bloqueios — pra você antecipar
            antes que a tarefa estoure o prazo.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
