// =====================================================
// KpiPill - Cards de KPI clicáveis (viram filtros)
// =====================================================
export interface KpiPillProps {
  label: string;
  count: number;
  color: "admin" | "amber" | "emerald" | "blue" | "gray" | "violet";
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  description?: string;
  /** "suave": ativo mantém fundo claro (padrão da tela de Faturas de Cartão). */
  estiloAtivo?: "solido" | "suave";
}

export function KpiPill({ label, count, color, active, onClick, icon, description, estiloAtivo = "solido" }: KpiPillProps) {
  const colorMap: Record<string, { bg: string; text: string; border: string; activeBg: string }> = {
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
  if (estiloAtivo === "suave") {
    c.activeBg = color === "admin" ? "bg-destructive/10 text-destructive border-destructive/40" : `${c.bg} ${c.text} ${c.border}`;
  }
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
      {description && (
        <div className="text-[9px] opacity-75 mt-0.5">{description}</div>
      )}
    </button>
  );
}
