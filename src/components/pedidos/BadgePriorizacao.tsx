import { Sparkles } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ScoreBreakdown } from "@/types/pedido";

interface Props {
  score: number;
  breakdown?: ScoreBreakdown | null;
  compact?: boolean;
  showIcon?: boolean;
}

function corPorScore(score: number): string {
  if (score >= 70) return "bg-red-500 text-white hover:bg-red-600";
  if (score >= 40) return "bg-yellow-500 text-black hover:bg-yellow-600";
  return "bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200";
}

function rotuloFaixa(score: number): string {
  if (score >= 70) return "Alta prioridade";
  if (score >= 40) return "Média";
  return "Normal";
}

export function BadgePriorizacao({
  score,
  breakdown,
  compact = false,
  showIcon = true,
}: Props) {
  const cor = corPorScore(score);
  const texto = compact ? `${score}` : `${score}/100`;

  const triggerEl = (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold cursor-help transition-colors",
        cor
      )}
    >
      {showIcon && <Sparkles className="h-3 w-3" />}
      {texto}
    </span>
  );

  if (!breakdown) {
    return triggerEl;
  }

  const linhas = [
    { label: "Idade", valor: breakdown.idade, max: 15 },
    { label: "Destrava", valor: breakdown.destrava, max: 20 },
    { label: "Expira", valor: breakdown.expira, max: 20 },
    { label: "Valor", valor: breakdown.valor, max: 20 },
    { label: "KA/Mestre", valor: breakdown.ka_mestre, max: 10 },
    { label: "Urgência", valor: breakdown.urgencia, max: 15 },
  ];

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{triggerEl}</TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Score IA · {rotuloFaixa(score)}
            </p>
            <div className="space-y-0.5 text-xs">
              {linhas.map((l) => (
                <div key={l.label} className="flex justify-between gap-3">
                  <span className="opacity-80">{l.label}</span>
                  <span className="font-mono">
                    {l.valor}/{l.max}
                  </span>
                </div>
              ))}
            </div>
            <div className="pt-1 mt-1 border-t border-border/40 flex justify-between text-xs font-semibold">
              <span>Total</span>
              <span className="font-mono">{score}/100</span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
