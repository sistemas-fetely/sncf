// "Custo" — soma das atribuições ligadas aos passos. Sem passo ligado, o custo é ZERO
// e zero aqui significa "não mapeado", nunca "não custa nada".
import { Coins, Info } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatError } from "@/lib/format-error";
import { useProcessoCusto } from "@/hooks/processos/useProcessoPassos";

function n(v: number | null | undefined) {
  if (v == null) return "—";
  const x = Number(v);
  if (!Number.isFinite(x)) return "—";
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
}

export function CustoProcesso({ processoId }: { processoId: string }) {
  const custo = useProcessoCusto(processoId);
  const d = custo.data;

  return (
    <TooltipProvider>
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Custo</h2>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-sm">
                <p className="text-xs">
                  O custo é a soma das atribuições ligadas aos passos deste processo. Zero
                  significa NÃO MAPEADO, não que o processo não custa nada.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>

          {custo.isLoading && <Skeleton className="h-16 w-full" />}
          {custo.isError && <p className="text-sm text-destructive">{formatError(custo.error)}</p>}

          {!custo.isLoading && !custo.isError && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
              <div>
                <p className="text-2xl font-medium">{n(d?.passos)}</p>
                <p className="text-[11px] text-muted-foreground">Passos</p>
              </div>
              <div>
                <p className="text-2xl font-medium">{n(d?.passos_com_dono)}</p>
                <p className="text-[11px] text-muted-foreground">Passos com dono</p>
              </div>
              <div>
                <p className="text-2xl font-medium">{n(d?.pessoas_envolvidas)}</p>
                <p className="text-[11px] text-muted-foreground">Pessoas envolvidas</p>
              </div>
              <div>
                <p className="text-2xl font-medium">{n(d?.horas_dia)}</p>
                <p className="text-[11px] text-muted-foreground">Horas por dia</p>
                <p className="text-[11px] text-muted-foreground">{n(d?.minutos_dia)} min/dia</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
