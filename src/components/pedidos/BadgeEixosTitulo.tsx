import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { EixoDim } from "@/hooks/credito/useTituloEixosDim";

/** Cores da dimensão → classes que o projeto já usa em Badge. */
const CLASSE_COR: Record<string, string> = {
  outline: "",
  amber: "bg-amber-100 text-amber-800 border-0 hover:bg-amber-100",
  emerald: "bg-emerald-100 text-emerald-800 border-0 hover:bg-emerald-100",
  muted: "bg-muted text-muted-foreground border-0 hover:bg-muted",
  destructive: "bg-destructive text-destructive-foreground border-0",
};

/**
 * Badge dos dois eixos de um título: status (principal) + prova (discreto).
 * Rótulo, cor e descrição vêm da dimensão no banco — nada hardcoded.
 */
export function BadgeEixosTitulo({
  status,
  prova,
  compacto,
}: {
  status: EixoDim | null | undefined;
  prova: EixoDim | null | undefined;
  compacto?: boolean;
}) {
  if (!status) return null;
  const cor = status.cor ?? "outline";
  const classe = CLASSE_COR[cor] ?? "";
  const badge = (
    <Badge
      variant={cor === "outline" ? "outline" : "default"}
      className={cn(compacto && "text-[10px]", classe, status.descricao && "cursor-help")}
    >
      {status.rotulo}
    </Badge>
  );

  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      {status.descricao ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">{badge}</span>
          </TooltipTrigger>
          <TooltipContent>
            <p className="max-w-xs">{status.descricao}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        badge
      )}
      {prova && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "text-muted-foreground cursor-help",
                compacto ? "text-[9px]" : "text-xs",
              )}
            >
              {prova.rotulo}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p className="max-w-xs">{prova.descricao ?? prova.rotulo}</p>
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}
