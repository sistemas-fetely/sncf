import { NavLink } from "react-router-dom";
import { useCasaApp } from "@/hooks/useCasaApp";
import { CASA_APPS } from "./CasaApps";
import { cn } from "@/lib/utils";

export function CasaTopNav({ className }: { className?: string }) {
  const activeApp = useCasaApp();
  const visibleApps = CASA_APPS.filter((a) => !a.hiddenFromTopNav);

  return (
    <nav className={cn("flex items-center gap-1", className)} aria-label="Apps da Casa Fetély">
      {visibleApps.map((app) => {
        const isActive = activeApp.id === app.id;
        return (
          <NavLink
            key={app.id}
            to={app.defaultRoute}
            end={app.id === "casa"}
            className={cn(
              "px-3 py-2 text-[11px] uppercase tracking-[2.5px] transition-colors relative",
              "hover:text-foreground",
              isActive
                ? "text-gold font-medium"
                : "text-muted-foreground"
            )}
          >
            {app.label}
            {isActive && (
              <span
                aria-hidden="true"
                className="absolute -bottom-[11px] left-3 right-3 h-[1.5px] bg-gold"
              />
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
