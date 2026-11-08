import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CARDS_OPERACIONAIS, ROTULOS_FILA } from "@/lib/estoque/filaOperacionalEstoque";
import type { useFilaOperacionalEstoque } from "@/hooks/estoque/useFilaOperacionalEstoque";
import { formatError } from "@/lib/format-error";
import { formatBRL } from "@/lib/format-currency";
import { cn } from "@/lib/utils";

export function FilaOperacionalEstoque({ fila, ativo, onCard }: { fila: ReturnType<typeof useFilaOperacionalEstoque>; ativo: string; onCard: (card: string) => void }) {
  return <>
    <section aria-label="Fila operacional de estoque" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
      {CARDS_OPERACIONAIS.map(c => <Button key={c} variant="outline" aria-pressed={ativo === c}
        onClick={() => onCard(ativo === c ? "" : c)}
        className={cn("h-auto min-h-24 block rounded-md p-3 text-left whitespace-normal shadow-sm", fila.skus[c].size === 0 ? "bg-muted text-muted-foreground" : "bg-card", ativo === c && "ring-2 ring-primary")}>
        <div className="text-xs text-muted-foreground">{ROTULOS_FILA[c]}</div>
        <div className="text-2xl font-bold tabular-nums">{fila.error ? "—" : fila.isLoading ? "…" : fila.skus[c].size}</div>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          {c === "repor" ? `${fila.urgente} urgente · ${fila.carga} carga` : c === "parado_xpm" ? `${formatBRL(fila.custoPosicao)}/mês em posição` : c === "sem_giro" ? `${fila.unidadesParadas.toLocaleString("pt-BR")} un paradas` : "SKUs"}
        </div>
      </Button>)}
    </section>
    {fila.error && <Alert variant="destructive"><AlertDescription>{formatError(fila.error)}</AlertDescription></Alert>}
  </>;
}