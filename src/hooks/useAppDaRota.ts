import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useNavegacaoMenu, type LinhaMenu } from "@/hooks/useMenuApp";

export interface AppDaRota {
  appChave: string;
  appLinha: LinhaMenu | null;
}

/** Rota da tabela sem query string (ex.: "/x?aba=y" -> "/x"). */
function semQuery(rota: string): string {
  const i = rota.indexOf("?");
  return i >= 0 ? rota.slice(0, i) : rota;
}

/** Resolve o app dono de um pathname pelo MAIOR prefixo de `rota` na tabela. */
export function resolverAppDaRota(
  pathname: string,
  linhas: LinhaMenu[] | undefined
): AppDaRota | null {
  if (!linhas?.length) return null;
  let melhor: LinhaMenu | null = null;
  let tam = -1;
  for (const l of linhas) {
    if (!l.rota || !l.app_chave) continue;
    const r = semQuery(l.rota);
    if (!r || r === "/") {
      if (pathname === "/" && 1 > tam) { melhor = l; tam = 1; }
      continue;
    }
    if ((pathname === r || pathname.startsWith(r + "/")) && r.length > tam) {
      melhor = l;
      tam = r.length;
    }
  }
  if (!melhor) return null;
  const appLinha =
    linhas.find((l) => l.nivel === "app" && l.chave === melhor!.app_chave) ?? null;
  return { appChave: melhor.app_chave, appLinha };
}

/** App dono da rota atual, segundo sncf_navegacao. null se a rota não está na tabela. */
export function useAppDaRota(): AppDaRota | null {
  const { pathname } = useLocation();
  const { data: linhas } = useNavegacaoMenu();
  return useMemo(() => resolverAppDaRota(pathname, linhas), [pathname, linhas]);
}
