/**
 * KpiPill — pill de filtro Fetely (cluster Tudo/A pagar/Realizado).
 *
 * Visual idêntico ao KpiPill usado em NFsStage e DocumentosPendentes
 * (Doutrina #11: não duplicar variante visual). Mantido aqui só por
 * conveniência de import; se algum dia precisar ser global, mover pra
 * `src/components/financeiro/KpiPill.tsx`.
 */
import type { ReactNode } from "react";

export type KpiPillColor = "admin" | "amber" | "emerald" | "blue" | "gray" | "violet";

interface Props {
  label: string;
  count: number;
  color: KpiPillColor;
  active: boolean;
  onClick: () => void;
  icon?: ReactNode;
  description?: string;
}

export default function KpiPill({
  label,
  count,
  color,
  active,
  onClick,
  icon,
  description,
}: Props) {
  const colorMap: Record<
    KpiPillColor,
    { bg: string; text: string; border: string; activeBg: string }
  > = {
    admin: {
      bg: "bg-admin/5",
      text: "text-admin",
      border: "border-admin/20",
      activeBg: "bg-admin text-admin-foreground border-admin",
    },
    amber: {
      bg: "bg-warning/10",
      text: "text-warning",
      border: "border-warning/40",
      activeBg: "bg-warning text-white border-warning/40",
    },
    emerald: {
      bg: "bg-success/10",
      text: "text-success",
      border: "border-success/40",
      activeBg: "bg-success text-white border-success/40",
    },
    blue: {
      bg: "bg-info/10",
      text: "text-info",
      border: "border-info/40",
      activeBg: "bg-info text-white border-info/40",
    },
    gray: {
      bg: "bg-muted/10",
      text: "text-muted-foreground",
      border: "border-border/40",
      activeBg: "bg-muted text-white border-border/40",
    },
    violet: {
      bg: "bg-info/10",
      text: "text-info",
      border: "border-info/40",
      activeBg: "bg-info text-white border-info/40",
    },
  };
  const c = colorMap[color];
  const cls = active
    ? `${c.activeBg} shadow-md`
    : `${c.bg} ${c.text} ${c.border} hover:shadow-sm`;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border-2 px-3 py-2 transition-all text-left min-w-[120px] ${cls}`}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide opacity-90">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-medium leading-tight mt-0.5">{count}</div>
      {description && <div className="text-[9px] opacity-75 mt-0.5">{description}</div>}
    </button>
  );
}
