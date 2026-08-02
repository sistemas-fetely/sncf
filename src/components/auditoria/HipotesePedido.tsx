/**
 * Hipótese do sistema para o pedido (vw_pedido_hipotese).
 * Rótulo e cor vêm da view — nada hardcoded aqui além do mapa
 * token→classe Tailwind (a view devolve "emerald" | "amber" | "outline").
 */
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format-currency";
import { Layers } from "lucide-react";
import type { Hipotese } from "@/hooks/useDossiePedido";

const COR_TOKEN: Record<string, string> = {
  emerald: "border-success/50 bg-success/10 text-success",
  amber: "border-warning/50 bg-warning/10 text-warning",
  outline: "border-border text-muted-foreground",
};

function classesDaCor(cor: string | null | undefined) {
  return (cor && COR_TOKEN[cor]) || COR_TOKEN.outline;
}

export function HipoteseLista({ hipoteses }: { hipoteses: Hipotese[] }) {
  if (hipoteses.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        Sem hipótese mapeada para este meio ainda
      </div>
    );
  }

  const ordenadas = [...hipoteses].sort((a, b) => {
    const ca = a.confianca_ordem ?? 99;
    const cb = b.confianca_ordem ?? 99;
    if (ca !== cb) return ca - cb;
    return (a.regra_ordem ?? 99) - (b.regra_ordem ?? 99);
  });

  return (
    <div className="space-y-3">
      {ordenadas.map((h, i) => (
        <div
          key={`${h.regra_codigo ?? "regra"}-${i}`}
          className="rounded-lg border bg-background p-3 space-y-2"
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              {h.confianca_rotulo && (
                <Badge variant="outline" className={cn("border", classesDaCor(h.confianca_cor))}>
                  {h.confianca_rotulo}
                </Badge>
              )}
              <span className="text-sm font-semibold">{h.regra_rotulo || h.regra_codigo || "—"}</span>
              {h.permite_lote === true && (
                <Badge variant="secondary" className="gap-1">
                  <Layers className="h-3 w-3" />
                  Acionável em lote
                </Badge>
              )}
            </div>
            {h.valor_em_jogo != null && (
              <span className="text-sm font-semibold tabular-nums flex-shrink-0">
                {formatBRL(Number(h.valor_em_jogo))}
              </span>
            )}
          </div>

          {h.evidencia_texto && (
            <div className="text-sm text-muted-foreground leading-relaxed">{h.evidencia_texto}</div>
          )}

          {h.acao && (
            <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-primary font-semibold mb-0.5">
                Ação sugerida
              </div>
              <div className="text-sm leading-snug text-foreground">{h.acao}</div>
              {h.tela && (
                <div className="text-xs text-muted-foreground mt-1">Resolve em: {h.tela}</div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
