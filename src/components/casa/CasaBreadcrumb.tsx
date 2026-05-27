import { Fragment } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CasaBreadcrumbItem {
  label: string;
  to?: string;
}

interface Props {
  items: CasaBreadcrumbItem[];
  className?: string;
}

export function CasaBreadcrumb({ items, className }: Props) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("flex items-center gap-1.5 text-xs", className)}
    >
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <Fragment key={`${item.label}-${idx}`}>
            {idx > 0 && (
              <ChevronRight
                className="h-3 w-3 text-muted-foreground/60 flex-shrink-0"
                aria-hidden="true"
              />
            )}
            {item.to && !isLast ? (
              <Link
                to={item.to}
                className="uppercase tracking-[2px] text-muted-foreground hover:text-gold transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={cn(
                  "uppercase tracking-[2px]",
                  isLast ? "text-gold font-medium" : "text-muted-foreground"
                )}
                aria-current={isLast ? "page" : undefined}
              >
                {item.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
