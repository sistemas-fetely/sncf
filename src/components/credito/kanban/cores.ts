/** Cor da raia (texto do banco) → tokens do design system. Nada hardcoded. */
export type TomRaia = "destructive" | "warning" | "info" | "primary" | "muted";

export function tomDaRaia(cor: string | null | undefined): TomRaia {
  switch ((cor ?? "").toLowerCase()) {
    case "red": return "destructive";
    case "orange":
    case "amber": return "warning";
    case "blue": return "info";
    case "purple": return "primary";
    default: return "muted";
  }
}

export const CLASSE_TOPO: Record<TomRaia, string> = {
  destructive: "border-t-destructive",
  warning: "border-t-warning",
  info: "border-t-info",
  primary: "border-t-primary",
  muted: "border-t-muted-foreground/40",
};

export const CLASSE_PONTO: Record<TomRaia, string> = {
  destructive: "bg-destructive",
  warning: "bg-warning",
  info: "bg-info",
  primary: "bg-primary",
  muted: "bg-muted-foreground/50",
};

export const CORES_RAIA = ["red", "orange", "amber", "blue", "purple", "gray"] as const;

export function fmtDiaMes(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}`;
}

export function fmtDataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function hojeIsoLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function iniciais(nome: string | null | undefined): string {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  return ((partes[0][0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}
