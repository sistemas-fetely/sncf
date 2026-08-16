import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Sistema Visual Fetely §4 — semantica de estado.
 * Estado nunca e texto colorido solto: e selo.
 * REGRA: uma unica coluna de estado por tabela. Dado cadastral (CIF/FOB, UF, canal)
 * NAO e estado — vai como texto miudo em muted-foreground, sem selo.
 * Selo nao e clicavel. Se precisa clicar, e botao.
 */
export type EstadoSelo = "success" | "warning" | "destructive" | "info" | "muted";

const ESTILOS: Record<EstadoSelo, string> = {
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  destructive: "bg-destructive/15 text-destructive",
  info: "bg-info/15 text-info",
  muted: "bg-muted text-muted-foreground",
};

interface SeloProps {
  /** success = concluido/pago/conciliado · warning = pendente/aguardando · destructive = atrasado/recusado/erro · info = em transito/processando · muted = rascunho/inativo */
  estado?: EstadoSelo;
  children: ReactNode;
  className?: string;
}

export function Selo({ estado = "muted", children, className }: SeloProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-normal leading-normal",
        ESTILOS[estado],
        className
      )}
    >
      {children}
    </span>
  );
}
