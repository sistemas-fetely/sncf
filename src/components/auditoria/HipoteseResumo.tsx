/**
 * Resumo compacto da hipótese na LINHA do achado.
 * Mostra confiança, regra e a AÇÃO do pedido específico — sem repetir
 * `evidencia_texto`, que fica no bloco Contexto.
 * Somente leitura: nenhuma ação além do botão de rota, que vive na página.
 */
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Layers } from "lucide-react";
import type { HipoteseResumoRow } from "@/hooks/useHipoteseMap";

const COR_TOKEN: Record<string, string> = {
  emerald: "border-success/50 bg-success/10 text-success",
  amber: "border-warning/50 bg-warning/10 text-warning",
  outline: "border-border text-muted-foreground",
};

export default function HipoteseResumo({ h }: { h: HipoteseResumoRow }) {
  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        {h.confianca_rotulo && (
          <Badge
            variant="outline"
            className={cn("border", (h.confianca_cor && COR_TOKEN[h.confianca_cor]) || COR_TOKEN.outline)}
          >
            {h.confianca_rotulo}
          </Badge>
        )}
        <span className="text-xs font-semibold">{h.regra_rotulo || h.regra_codigo || "—"}</span>
        {h.permite_lote === true && (
          <Badge variant="secondary" className="gap-1">
            <Layers className="h-3 w-3" />
            Acionável em lote
          </Badge>
        )}
      </div>
      {h.acao && <div className="text-sm font-medium leading-snug text-foreground">{h.acao}</div>}
    </div>
  );
}
