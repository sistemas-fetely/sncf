import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CodProduto } from "@/components/produto/CodProduto";
import { cn } from "@/lib/utils";
import type { CoberturaCd } from "@/hooks/estoque/useCoberturaPorCd";

/** Tag de cobertura de um CD: "Atende" (verde) ou "Falta N" (âmbar, faltas no tooltip). */
export function CdCoberturaTag({ cobertura, className }: { cobertura: CoberturaCd | undefined | null; className?: string }) {
  if (!cobertura) return null;
  if (cobertura.cobre) {
    return <Badge variant="outline" className={cn("h-5 border-success/40 bg-success/10 px-1.5 text-[10px] font-medium text-success", className)}>Atende</Badge>;
  }
  const n = Math.max(0, cobertura.itens - cobertura.cobertos);
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            onPointerDown={(e) => e.stopPropagation()}
            className={cn("h-5 cursor-help border-warning/40 bg-warning/10 px-1.5 text-[10px] font-medium text-warning", className)}
          >
            Falta {n}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="text-xs">
          <ul className="space-y-0.5 tabular-nums">
            {(cobertura.faltas ?? []).map((f) => (
              <li key={f.sku} className="flex items-center gap-2">
                <CodProduto chave={f.sku} variant="compacto" />
                <span>· {f.pedido}/{f.disponivel}</span>
              </li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default CdCoberturaTag;
