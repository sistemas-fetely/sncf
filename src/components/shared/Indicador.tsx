import { cn } from "@/lib/utils";

export function Indicador({ titulo, valor, subtexto, alerta = false, compacto = false }: { titulo: string; valor: string | number; subtexto?: string; alerta?: boolean; compacto?: boolean }) {
  return <div className={cn("rounded-lg border bg-card p-3 min-w-0", alerta && "border-warning/40")}>
    <div className="text-xs text-muted-foreground">{titulo}</div>
    <div className={cn("font-medium tabular-nums", compacto ? "text-sm whitespace-nowrap" : "text-xl", alerta && "text-warning", valor === "—" && "text-muted-foreground")}>{valor}</div>
    {subtexto && <div className="text-xs text-muted-foreground break-words">{subtexto}</div>}
  </div>;
}