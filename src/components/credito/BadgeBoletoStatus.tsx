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
    className: "bg-amber-50 text-amber-700 border border-amber-200",
    icon: <FileText className="h-3 w-3" />,
  },
  registrado: {
    label: "Registrado",
    className: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  rejeitado: {
    label: "Rejeitado",
    className: "bg-red-50 text-red-700 border border-red-200",
    icon: <XCircle className="h-3 w-3" />,
  },
  vencido: {
    label: "Vencido",
    className: "bg-red-100 text-red-800 border border-red-300",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  pago_manual: {
    label: "Pago (manual)",
    className: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  pago_banco: {
    label: "Pago (banco)",
    className: "bg-emerald-100 text-emerald-800 border border-emerald-300",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  baixa_solicitada: {
    label: "Baixa solicitada",
    className: "bg-amber-50 text-muted-foreground border border-amber-200",
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
