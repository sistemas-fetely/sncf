import { CheckCircle2, XCircle, Clock, FileText, AlertTriangle, Archive } from "lucide-react";
import type { JSX } from "react";

type StatusMap = { label: string; className: string; icon: JSX.Element };

const MAP: Record<string, StatusMap> = {
  pendente: {
    label: "Pendente",
    className: "bg-muted text-muted-foreground border border-border",
    icon: <Clock className="h-3 w-3" />,
  },
  remessa_gerada: {
    label: "Remessa gerada",
    className: "bg-warning/10 text-warning border border-warning/40",
    icon: <FileText className="h-3 w-3" />,
  },
  registrado: {
    label: "Registrado",
    className: "bg-success/10 text-success border border-success/40",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  rejeitado: {
    label: "Rejeitado",
    className: "bg-destructive/10 text-destructive border border-destructive/40",
    icon: <XCircle className="h-3 w-3" />,
  },
  vencido: {
    label: "Vencido",
    className: "bg-destructive/10 text-destructive border border-destructive/40",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  pago_manual: {
    label: "Pago (manual)",
    className: "bg-success/10 text-success border border-success/40",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  pago_banco: {
    label: "Pago (banco)",
    className: "bg-success/10 text-success border border-success/40",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  baixa_solicitada: {
    label: "Baixa solicitada",
    className: "bg-warning/10 text-muted-foreground border border-warning/40",
    icon: <Clock className="h-3 w-3" />,
  },
  baixa_remessa_gerada: {
    label: "Baixa em remessa",
    className: "bg-info/10 text-info border border-info/40",
    icon: <Clock className="h-3 w-3" />,
  },
  baixado_banco: {
    label: "Baixado (banco)",
    className: "bg-muted text-muted-foreground border border-border",
    icon: <Archive className="h-3 w-3" />,
  },
};

export function BadgeBoletoStatus({
  status,
  codigoRejeicao,
}: {
  status: string | null | undefined;
  codigoRejeicao?: string | null;
}) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
        —
      </span>
    );
  }
  const entry = MAP[status];
  if (!entry) {
    // fallback: nunca mentir — mostra o valor cru
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
        {status}
      </span>
    );
  }
  const label =
    status === "rejeitado" && codigoRejeicao ? `Rejeitado (${codigoRejeicao})` : entry.label;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${entry.className}`}
    >
      {entry.icon}
      {label}
    </span>
  );
}

export default BadgeBoletoStatus;
