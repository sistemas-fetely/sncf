import { Link } from "react-router-dom";
import { Check, ExternalLink, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useMesaSpStatus } from "@/hooks/pedidos/useMesaSpStatus";

/**
 * BANCADA-SP-TRAVA (19/10/2026): faixa no topo do detalhe do pedido B2B mostrando
 * que ele está na Expedição SP e em que etapa — ninguém age sem saber que a Mesa
 * está trabalhando nele. Só renderiza quando a RPC diz na_mesa_sp = true.
 */

const ETAPAS = [
  { key: "fila", label: "Fila" },
  { key: "separacao", label: "Separação" },
  { key: "embalagem", label: "Embalagem" },
  { key: "aguardando_nf", label: "Aguardando NF" },
  { key: "aguardando_coleta", label: "Aguardando despacho" },
  { key: "despachado", label: "Despachado" },
] as const;

export function FaixaMesaSp({ pedidoId }: { pedidoId: string }) {
  const { data: status, isError, error } = useMesaSpStatus(pedidoId);

  if (isError) {
    return (
      <div className="mx-6 mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive-strong">
        Falha ao consultar a Expedição SP: {error instanceof Error ? error.message : String(error)}
      </div>
    );
  }
  if (!status?.na_mesa_sp) return null;

  const travado = !!status.travado;
  const idxEtapa = ETAPAS.findIndex((e) => e.key === status.etapa);

  return (
    <div
      className={cn(
        "mx-6 mb-3 rounded-lg border p-3",
        travado ? "border-warning/40 bg-warning/10" : "border bg-muted/40",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Package className={cn("h-4 w-4 shrink-0", travado ? "text-warning-strong" : "text-muted-foreground")} />
        <span className="text-sm">Expedição pelo Site SP</span>
        {status.rotulo && (
          <span className={cn("text-sm font-semibold", travado ? "text-warning-strong" : "text-foreground")}>
            {status.rotulo}
          </span>
        )}
        {travado && (
          <Badge variant="outline" className="border-warning/60 text-warning-strong text-[10px]">
            Em separação — ações bloqueadas
          </Badge>
        )}
        <Link
          to="/logistica/expedicao-sp"
          className="ml-auto inline-flex items-center gap-1 text-xs underline hover:text-foreground"
        >
          Abrir Expedição SP <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {status.dica && (
        <p className={cn("mt-1 text-xs", travado ? "text-warning-strong" : "text-muted-foreground")}>
          {status.dica}
        </p>
      )}

      {idxEtapa >= 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]">
          {ETAPAS.map((e, idx) => {
            const feita = idx < idxEtapa;
            const atual = idx === idxEtapa;
            return (
              <span key={e.key} className="flex items-center gap-1.5">
                {idx > 0 && <span aria-hidden className="text-muted-foreground/50">→</span>}
                <span
                  className={cn(
                    "flex items-center gap-1",
                    atual && "font-semibold text-foreground",
                    !atual && (feita ? "text-muted-foreground" : "text-muted-foreground/60"),
                  )}
                >
                  {feita && <Check className="h-3 w-3 text-success-strong" />}
                  {e.label}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
