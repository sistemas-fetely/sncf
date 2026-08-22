import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { PageHeader } from "./PageHeader";

/**
 * @deprecated Use `PageHeader`. Mantido como casca fina desde 22/08/2026 para
 * as 24 telas que já o usavam não precisarem ser tocadas na unificação.
 * Em tela nova, use `PageHeader` direto.
 */
interface PageTitleProps {
  titulo: string;
  estado?: ReactNode;
  icone?: LucideIcon;
  acoes?: ReactNode;
  className?: string;
}

export function PageTitle({ titulo, estado, icone, acoes, className }: PageTitleProps) {
  return (
    <PageHeader
      titulo={titulo}
      estado={estado}
      icone={icone}
      acoes={acoes}
      className={className}
    />
  );
}
