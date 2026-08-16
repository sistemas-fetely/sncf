import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Sistema Visual Fetely §7 — LARGURA-NASCE-DO-CONTEUDO.
 * A largura de uma pagina e determinada pelo tipo de conteudo, nao por gosto.
 * Pagina NAO escreve padding proprio nem max-w-*. Quem resolve isso e este componente.
 */
export type LarguraPagina = "dados" | "leitura" | "foco";

const LARGURAS: Record<LarguraPagina, string> = {
  dados: "w-full",
  leitura: "mx-auto w-full max-w-[896px]",
  foco: "mx-auto w-full max-w-[672px]",
};

interface PageShellProps {
  /** dados = tabelas, dashboards, listagens (padrao) · leitura = formularios e texto · foco = decisao unica */
  variant?: LarguraPagina;
  children: ReactNode;
  className?: string;
}

export function PageShell({ variant = "dados", children, className }: PageShellProps) {
  return (
    <div className={cn("px-6 py-6", className)}>
      <div className={cn(LARGURAS[variant], "space-y-4")}>{children}</div>
    </div>
  );
}
