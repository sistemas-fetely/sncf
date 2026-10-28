import { useLocation } from "react-router-dom";
import { CASA_APPS, type CasaApp } from "@/components/casa/CasaApps";
import { useAppDaRota } from "@/hooks/useAppDaRota";

/**
 * Retorna o App ativo baseado na rota atual. Casa é o fallback.
 * Fonte primária: app dono da rota em sncf_navegacao (useAppDaRota);
 * routeMatchers de CASA_APPS só para rota que não está na tabela.
 */
export function useCasaApp(): CasaApp {
  const { pathname } = useLocation();
  const daRota = useAppDaRota();

  if (daRota) {
    const legado = CASA_APPS.find((a) => (a.appChaves ?? [a.id]).includes(daRota.appChave));
    if (legado) return legado;
  }

  // Match mais específico vence (string mais longa primeiro)
  const sorted = [...CASA_APPS]
    .flatMap((app) => app.routeMatchers.map((matcher) => ({ app, matcher })))
    .sort((a, b) => b.matcher.length - a.matcher.length);

  for (const { app, matcher } of sorted) {
    if (matcher === "/") {
      if (pathname === "/") return app;
      continue;
    }
    if (pathname === matcher || pathname.startsWith(matcher + "/")) {
      return app;
    }
  }

  return CASA_APPS[0]; // Casa fallback
}
