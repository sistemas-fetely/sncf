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
        "flex items-start justify-between gap-4 flex-wrap mb-6",
        className
      )}
    >
      <div className="space-y-2 min-w-0">
        <CasaBreadcrumb items={breadcrumb} />
        <h1 className="font-serif text-3xl md:text-4xl tracking-tight text-foreground leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm italic text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </header>
  );
}
