import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavegacaoMenu } from "@/hooks/useMenuApp";

const ROTAS_IGNORADAS = new Set(["/", "/login", "/logout"]);

/**
 * Registra a visita de página em usuario_paginas_recentes — FONTE-ÚNICA-DE-
 * NAVEGAÇÃO (22/08/2026).
 *
 * Alimenta duas leituras: o popover de Recentes e a RPC
 * meus_atalhos_personalizados (widget de atalhos do Portal). Antes existiam
 * DOIS rastreios paralelos gravando em tabelas diferentes — este e o
 * useRegistrarNavegacao (navegacao_log) — e as duas tabelas estavam vazias.
 *
 * Duas causas do vazio, corrigidas aqui:
 *  1. O título/pilar vinham de um ROUTE_MAP hardcoded com ~28 rotas. Rota
 *     fora da lista devolvia null e NÃO gravava — a maior parte do sistema
 *     nunca entrou. Agora resolve contra a sncf_navegacao (MENU-VIA-TABELA),
 *     que conhece todas as telas declaradas.
 *  2. Este hook era montado só em layouts de pouco/nenhum uso. Agora vive no
 *     CasaLayout, que envolve o sistema inteiro — montar em mais de um lugar
 *     duplicaria o registro.
 */
export function useTrackPageVisit() {
  const location = useLocation();
  const { user } = useAuth();
  const { data: nav } = useNavegacaoMenu();
  // Guarda a última rota gravada nesta sessão de componente, pra não repetir
  // no re-render. O debounce de 10s em sessionStorage cobre o F5.
  const ultimaRota = useRef<string | null>(null);

  // Dep é user?.id (string) e não user (objeto): com o objeto, qualquer
  // re-render do AuthContext reexecutava o efeito.
  const userId = user?.id;

  useEffect(() => {
    if (!userId || !nav?.length) return;

    const pathname = location.pathname;
    if (ROTAS_IGNORADAS.has(pathname)) return;
    if (ultimaRota.current === pathname) return;

    // Resolve contra a tabela: casa exata, senão o prefixo declarado mais
    // longo (ex: /pedidos/123 registra como Pedidos B2B).
    const comRota = nav.filter((l) => !!l.rota);
    let alvo = comRota.find((l) => l.rota === pathname) ?? null;
    if (!alvo) {
      for (const l of comRota) {
        const r = l.rota as string;
        if (r !== "/" && pathname.startsWith(r + "/")) {
          if (!alvo || r.length > (alvo.rota as string).length) alvo = l;
        }
      }
    }
    // Rota não declarada não vira histórico (guarda de nascimento).
    if (!alvo) return;

    const chaveDebounce = `track_${pathname}`;
    const ultimo = sessionStorage.getItem(chaveDebounce);
    if (ultimo && Date.now() - parseInt(ultimo) < 10000) return;
    sessionStorage.setItem(chaveDebounce, Date.now().toString());
    ultimaRota.current = pathname;

    void supabase.from("usuario_paginas_recentes").insert({
      user_id: userId,
      rota: pathname,
      titulo: alvo.label,
      pilar: alvo.app_chave,
    });
  }, [location.pathname, userId, nav]);
}
