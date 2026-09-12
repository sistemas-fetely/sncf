import { useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useCasaApp } from "@/hooks/useCasaApp";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissoesDoUsuario, TELAS_PUBLICAS } from "@/hooks/usePermissoesDoUsuario";
import { useNavegacaoMenu, type LinhaMenu } from "@/hooks/useMenuApp";
import { useTelasVisiveis } from "@/hooks/useTelasVisiveis";
import { CASA_APPS, type CasaApp } from "./CasaApps";
import { cn } from "@/lib/utils";

/**
 * BARRA-VIA-TABELA (12/09/2026): a lista de apps do topo era o array hardcoded
 * CASA_APPS. Resultado: 4 apps que existem em sncf_navegacao com 'top' nas
 * superficies (chamados, comercial, operacao, triagem) nunca apareciam, e a
 * ordem era a do array em vez da coluna `ordem`.
 *
 * Agora a lista vem de sncf_navegacao (nivel='app', ativo, 'top' em
 * superficies, ordenada por `ordem`). CASA_APPS segue vivo apenas como
 * complemento do que a tabela nao tem: rota de fallback quando `rota` e nula,
 * slugPrefix (permissao granular) e os routeMatchers do item ativo.
 */
export function CasaTopNav({ className }: { className?: string }) {
  const activeApp = useCasaApp();
  const { pathname } = useLocation();
  const { roles } = useAuth();
  const isSuperAdmin = (roles ?? []).includes("super_admin");
  const { data: permitidas } = usePermissoesDoUsuario();
  const { data: linhas } = useNavegacaoMenu();

  /** chave da tabela -> entrada legada de CASA_APPS (fallback de rota/matchers) */
  const legadoPorChave = useMemo(() => {
    const map = new Map<string, CasaApp>();
    for (const app of CASA_APPS) {
      for (const chave of app.appChaves ?? [app.id]) map.set(chave, app);
    }
    return map;
  }, []);

  const appsTop = useMemo(() => {
    const apps = (linhas ?? []).filter(
      (l) => l.nivel === "app" && (l.superficies ?? []).includes("top")
    );
    return apps.sort((a, b) => a.ordem - b.ordem || a.label.localeCompare(b.label));
  }, [linhas]);

  const visibleApps = useMemo(
    () =>
      appsTop.filter((app) => {
        if (isSuperAdmin) return true;
        if (app.apenas_super_admin) return false;
        // tela_slug nulo => app publico da barra, aparece normalmente.
        if (!app.tela_slug) return true;
        if (TELAS_PUBLICAS.has(app.tela_slug)) return true;
        if (permitidas?.has(app.tela_slug)) return true;
        // Acesso granular preservado (ex: tela.fin_* libera Financas).
        const prefixo = legadoPorChave.get(app.chave)?.slugPrefix;
        if (prefixo && permitidas) {
          for (const s of permitidas) if (s.startsWith(prefixo)) return true;
        }
        return false;
      }),
    [appsTop, isSuperAdmin, permitidas, legadoPorChave]
  );

  /** rotas de sidebar de cada app, na ordem grupo -> item */
  const rotasPorApp = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!linhas) return map;

    for (const app of visibleApps) {
      const candidatos: { rota: string; ordemGrupo: number; ordemItem: number }[] = [];
      for (const linha of linhas) {
        if (linha.app_chave !== app.chave) continue;
        if (linha.nivel !== "item") continue;
        if (!linha.rota) continue;
        if (!(linha.superficies ?? []).includes("sidebar")) continue;

        const grupo = linhas.find(
          (l: LinhaMenu) => l.nivel === "grupo" && l.chave === linha.pai_chave
        );
        candidatos.push({
          rota: linha.rota,
          ordemGrupo: grupo?.ordem ?? 0,
          ordemItem: linha.ordem,
        });
      }
      candidatos.sort((a, b) => a.ordemGrupo - b.ordemGrupo || a.ordemItem - b.ordemItem);
      map.set(app.chave, candidatos.map((c) => c.rota));
    }
    return map;
  }, [linhas, visibleApps]);

  const todasRotasCandidatas = useMemo(() => {
    const rotas = new Set<string>();
    for (const app of visibleApps) {
      if (app.rota) rotas.add(app.rota);
      for (const r of rotasPorApp.get(app.chave) ?? []) rotas.add(r);
      const fallback = legadoPorChave.get(app.chave)?.defaultRoute;
      if (fallback) rotas.add(fallback);
    }
    return Array.from(rotas);
  }, [visibleApps, rotasPorApp, legadoPorChave]);

  const visiveisRotas = useTelasVisiveis(todasRotasCandidatas);

  const destinoDoApp = (app: LinhaMenu): string => {
    // `rota` na tabela manda.
    if (app.rota) return app.rota;

    const candidatas = rotasPorApp.get(app.chave) ?? [];
    const fallback = legadoPorChave.get(app.chave)?.defaultRoute;

    // Comportamento antigo preservado: a aba abre no defaultRoute do app
    // quando ele esta visivel (ou quando nao faz parte das candidatas).
    if (fallback) {
      if (!candidatas.includes(fallback)) return fallback;
      if (visiveisRotas.has(fallback)) return fallback;
    }
    for (const rota of candidatas) {
      if (visiveisRotas.has(rota)) return rota;
    }
    return fallback ?? candidatas[0] ?? "/";
  };

  const estaAtivo = (app: LinhaMenu): boolean => {
    const legado = legadoPorChave.get(app.chave);
    if (legado) return activeApp.id === legado.id;
    // Apps que so existem na tabela: casa pelo prefixo da propria rota ou das
    // rotas de sidebar do app.
    const prefixos = [app.rota, ...(rotasPorApp.get(app.chave) ?? [])].filter(
      Boolean
    ) as string[];
    return prefixos.some(
      (p) => p !== "/" && (pathname === p || pathname.startsWith(p + "/"))
    );
  };

  return (
    <nav className={cn("flex items-center gap-2", className)} aria-label="Apps da Casa Fetély">
      {visibleApps.map((app) => {
        const isActive = estaAtivo(app);
        return (
          <NavLink
            key={app.chave}
            to={destinoDoApp(app)}
            end={app.chave === "casa"}
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
