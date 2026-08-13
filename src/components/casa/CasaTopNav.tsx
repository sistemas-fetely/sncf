import { useMemo } from "react";
import { NavLink } from "react-router-dom";
import { useCasaApp } from "@/hooks/useCasaApp";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissoesDoUsuario, TELAS_PUBLICAS } from "@/hooks/usePermissoesDoUsuario";
import { useNavegacaoMenu } from "@/hooks/useMenuApp";
import { useTelasVisiveis } from "@/hooks/useTelasVisiveis";
import { CASA_APPS } from "./CasaApps";
import { cn } from "@/lib/utils";

export function CasaTopNav({ className }: { className?: string }) {
  const activeApp = useCasaApp();
  const { roles } = useAuth();
  const isSuperAdmin = (roles ?? []).includes("super_admin");
  const { data: permitidas } = usePermissoesDoUsuario();
  const { data: linhas } = useNavegacaoMenu();

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

  const rotasPorApp = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!linhas) return map;

    for (const app of visibleApps) {
      if (!app.appChaves || app.appChaves.length === 0) continue;

      const candidatos: { rota: string; ordemGrupo: number; ordemItem: number }[] = [];
      for (const chave of app.appChaves) {
        for (const linha of linhas) {
          if (linha.app_chave !== chave) continue;
          if (linha.nivel !== "item") continue;
          if (!linha.rota) continue;
          if (!(linha.superficies ?? []).includes("sidebar")) continue;

          const grupo = linhas.find((l) => l.nivel === "grupo" && l.chave === linha.pai_chave);
          candidatos.push({
            rota: linha.rota,
            ordemGrupo: grupo?.ordem ?? 0,
            ordemItem: linha.ordem,
          });
        }
      }

      candidatos.sort((a, b) => a.ordemGrupo - b.ordemGrupo || a.ordemItem - b.ordemItem);
      map.set(app.id, candidatos.map((c) => c.rota));
    }
    return map;
  }, [linhas, visibleApps]);

  const todasRotasCandidatas = useMemo(() => {
    const rotas = new Set<string>();
    for (const [, lista] of rotasPorApp) {
      for (const r of lista) rotas.add(r);
    }
    return Array.from(rotas);
  }, [rotasPorApp]);

  const visiveisRotas = useTelasVisiveis(todasRotasCandidatas);

  const destinoDoApp = (app: (typeof visibleApps)[number]): string => {
    if (!app.appChaves || app.appChaves.length === 0) return app.defaultRoute;
    const candidatas = rotasPorApp.get(app.id) ?? [];
    if (!candidatas.includes(app.defaultRoute)) return app.defaultRoute;
    if (visiveisRotas.has(app.defaultRoute)) return app.defaultRoute;
    for (const rota of candidatas) {
      if (visiveisRotas.has(rota)) return rota;
    }
    return app.defaultRoute;
  };

  return (
    <nav className={cn("flex items-center gap-2", className)} aria-label="Apps da Casa Fetély">
      {visibleApps.map((app) => {
        const isActive = activeApp.id === app.id;
        return (
          <NavLink
            key={app.id}
            to={destinoDoApp(app)}
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
