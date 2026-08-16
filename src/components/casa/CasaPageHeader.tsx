import { ReactNode } from "react";
import { CasaBreadcrumb, type CasaBreadcrumbItem } from "./CasaBreadcrumb";
import { cn } from "@/lib/utils";

interface Props {
  breadcrumb: CasaBreadcrumbItem[];
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

export function CasaPageHeader({
  breadcrumb,
  title,
  subtitle,
  actions,
  className,
}: Props) {
  return (
    <header
      className={cn(
        "flex items-start justify-between gap-4 flex-wrap mb-4",
        className
      )}
    >
      <div className="space-y-1.5 min-w-0">
        <CasaBreadcrumb items={breadcrumb} />
        <h1 className="font-display text-[27px] font-normal tracking-tight text-foreground leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </header>
  );
}
