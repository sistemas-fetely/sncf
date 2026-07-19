import { NavLink } from "react-router-dom";
import { useCasaApp } from "@/hooks/useCasaApp";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissoesDoUsuario, TELAS_PUBLICAS } from "@/hooks/usePermissoesDoUsuario";
import { CASA_APPS } from "./CasaApps";
import { cn } from "@/lib/utils";

export function CasaTopNav({ className }: { className?: string }) {
  const activeApp = useCasaApp();
  const { roles } = useAuth();
  const isSuperAdmin = (roles ?? []).includes("super_admin");
  const { data: permitidas } = usePermissoesDoUsuario();

  const visibleApps = CASA_APPS.filter((a) => {
    if (a.hiddenFromTopNav) return false;
    if (isSuperAdmin) return true;
    if (a.tela_slug && TELAS_PUBLICAS.has(a.tela_slug)) return true;
    if (a.tela_slug && permitidas?.has(a.tela_slug)) return true;
    // Acesso granular: aparece se tiver qualquer sub-slug do prefixo (ex: tela.fin_*)
    if (a.slugPrefix && permitidas) {
      for (const s of permitidas) {
        if (s.startsWith(a.slugPrefix)) return true;
      }
    }
    return false;
  });

  return (
    <nav className={cn("flex items-center gap-2", className)} aria-label="Apps da Casa Fetély">
      {visibleApps.map((app) => {
        const isActive = activeApp.id === app.id;
        return (
          <NavLink
            key={app.id}
            to={app.defaultRoute}
            end={app.id === "casa"}
            className={cn(
              "px-4 py-2.5 text-[13px] uppercase tracking-[2px] transition-colors relative",
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
                className="absolute -bottom-[12px] left-4 right-4 h-[1.5px] bg-gold"
              />
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
