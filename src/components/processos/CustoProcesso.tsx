// "Custo" — soma das atribuições ligadas aos passos. Sem passo ligado, o custo é ZERO
// e zero aqui significa "não mapeado", nunca "não custa nada".
import { Coins } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
  const semDono = (d?.passos_com_dono ?? 0) === 0;

  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Custo</h2>
        </div>

        {custo.isLoading && <Skeleton className="h-20 w-full" />}
        {custo.isError && <p className="text-sm text-destructive">{formatError(custo.error)}</p>}

        {!custo.isLoading && !custo.isError && (
          <>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[11px] text-muted-foreground">Passos</p>
                <p className="text-xl font-medium">{n(d?.passos)}</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[11px] text-muted-foreground">Passos com dono</p>
                <p className="text-xl font-medium">{n(d?.passos_com_dono)}</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[11px] text-muted-foreground">Pessoas envolvidas</p>
                <p className="text-xl font-medium">{n(d?.pessoas_envolvidas)}</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[11px] text-muted-foreground">Horas por dia</p>
                <p className="text-xl font-medium">{n(d?.horas_dia)}</p>
                <p className="text-[11px] text-muted-foreground">{n(d?.minutos_dia)} min/dia</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              O custo é a soma das atribuições ligadas aos passos deste processo.
              {semDono
                ? " Nenhum passo tem atribuição ligada, então o custo aparece zerado: isso significa NÃO MAPEADO, não que o processo não custe nada."
                : " Passos sem atribuição ligada não entram na conta — o número é piso, não teto."}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
