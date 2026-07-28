import { MapPin, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FreteRow } from "@/hooks/logistica/useFretesTransportadora";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function fmtDataCurta(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function statusBadge(
  statusOperacional: string | null | undefined,
  ocorrenciaTexto?: string | null,
) {
  switch (statusOperacional) {
    case "entregue":
      return { label: "Entregue", cls: "bg-success/15 text-success border-success/30", title: undefined as string | undefined };
    case "em_transito":
      return { label: "Em trânsito", cls: "bg-info/15 text-info border-info/30", title: undefined };
    case "atencao":
      return { label: "Atenção", cls: "bg-destructive/15 text-destructive border-destructive/30", title: undefined };
    case "terminal":
      return { label: "Terminal", cls: "bg-destructive/15 text-destructive border-destructive/30", title: undefined };
    default: {
      const txt = (ocorrenciaTexto ?? "").trim();
      if (txt) {
        const label = txt.length > 28 ? txt.slice(0, 27) + "…" : txt;
        return {
          label,
          cls: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
          title: txt,
        };
      }
      return { label: statusOperacional ?? "—", cls: "bg-muted text-muted-foreground border-border", title: undefined };
    }
  }
}

function fmtDataBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

export function tooltipResgate(frete: FreteRow): string | undefined {
  if (!frete.resgatado_por_outra_fonte) return undefined;
  const data = fmtDataBR(frete.entrega_confirmada_em);
  const oc = (frete.ocorrencia_texto ?? "").trim() || "—";
  return `Entrega confirmada pelo rastreio em ${data}. A transportadora ainda reporta: ${oc}`;
}

export function pctClass(pct: number | null | undefined) {
  if (pct == null) return "bg-muted text-muted-foreground";
  if (pct <= 15) return "bg-muted text-muted-foreground";
  if (pct <= 30) return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
  return "bg-destructive/15 text-destructive";
}

export function CardFrete({ frete }: { frete: FreteRow }) {
  const st = statusBadge(frete.classe, frete.ocorrencia_texto);
  const pct = frete.pct_frete_nf == null ? null : Number(frete.pct_frete_nf);
  return (
    <div className="rounded-lg border bg-card p-3 space-y-2 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-sm leading-tight">{frete.destinatario ?? "—"}</div>
        <Badge variant="outline" title={st.title} className={cn("text-[10px] font-medium border", st.cls)}>
          {st.label}
        </Badge>
      </div>

      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <MapPin className="h-3 w-3" />
        {frete.destinatario_cidade ?? "—"}{frete.destinatario_uf ? ` / ${frete.destinatario_uf}` : ""}
      </div>

      <div className="border-t pt-2 flex items-center justify-between text-xs">
        <span className="font-mono text-muted-foreground">
          NF {frete.nf_numero ?? "—"} · CT-e {frete.cte_numero ?? "—"}
        </span>
        <span className="text-muted-foreground">prazo {fmtDataCurta(frete.prazo_entrega)}</span>
      </div>

      {(frete.ocorrencia_codigo || frete.ocorrencia_label) && (
        <div className={cn("text-xs", frete.eh_problema ? "text-destructive" : "text-muted-foreground")}>
          {frete.ocorrencia_codigo ? `${frete.ocorrencia_codigo} · ` : ""}
          {frete.ocorrencia_label ?? frete.ocorrencia_texto ?? ""}
        </div>
      )}

      <div className="flex items-center justify-between text-xs pt-1">
        <span className="flex items-center gap-1">
          <DollarSign className="h-3 w-3 text-muted-foreground" />
          Frete <span className="font-medium">{frete.frete_total != null ? BRL.format(Number(frete.frete_total)) : "—"}</span>
        </span>
        {pct != null && (
          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", pctClass(pct))}>
            {pct.toFixed(1)}% da NF
          </span>
        )}
      </div>
    </div>
  );
}
