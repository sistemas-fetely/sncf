import { ReactNode } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import type { CasaBreadcrumbItem } from "./CasaBreadcrumb";

/**
 * @deprecated Use `PageHeader`. Mantido como casca fina desde 22/08/2026 para
 * as 22 telas que já o usavam não precisarem ser tocadas na unificação.
 * Em tela nova, use `PageHeader` direto.
 */
interface Props {
  breadcrumb: CasaBreadcrumbItem[];
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

export function CasaPageHeader({ breadcrumb, title, subtitle, actions, className }: Props) {
  return (
    <PageHeader
      titulo={title}
      breadcrumb={breadcrumb}
      estado={subtitle}
      acoes={actions}
      className={className}
    />
  );
}
