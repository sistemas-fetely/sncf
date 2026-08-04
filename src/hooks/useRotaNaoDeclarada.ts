import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { resolverRegraRota } from "@/config/rotasRegistry";
import { resolverRegraNavegacao, type RegraNavegacao } from "@/hooks/useNavegacaoPortao";

/**
 * Guarda de nascimento — doutrina DECLARAR-OU-NAO-EXISTE.
 *
 * Detecta rota que o RotaGate visitou e nao conseguiu resolver nem em
 * sncf_navegacao nem no rotasRegistry. Roda para TODOS, inclusive super_admin,
 * e de proposito ANTES do bypass: quem constroi tela nova e super_admin, entra
 * normalmente pelo bypass, e nunca descobre que a tela nasceu invisivel para
 * todo mundo que nao e super_admin.
 *
 * FAIL-LOUD: a chamada tem await e trata erro. Nunca fire-and-forget.
 */
export function useRotaNaoDeclarada(
  pathname: string,
  nav: RegraNavegacao[] | undefined,
  isLoadingNav: boolean,
  avisarNaTela: boolean
) {
  const jaReportado = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (isLoadingNav || !nav || nav.length === 0) return;
    if (jaReportado.current.has(pathname)) return;

    if (resolverRegraNavegacao(pathname, nav)) return;
    if (resolverRegraRota(pathname)) return;

    jaReportado.current.add(pathname);

    (async () => {
      try {
        const { error } = await (supabase as any).rpc("registrar_rota_nao_declarada", {
          p_rota: pathname,
          p_era_super_admin: avisarNaTela,
        });
        if (error) throw error;
      } catch (e) {
        console.error("[useRotaNaoDeclarada] falha ao registrar rota nao declarada", pathname, e);
        if (avisarNaTela) {
          toast.error("Nao consegui registrar esta rota nao declarada. Veja o console.");
        }
        return;
      }

      if (avisarNaTela) {
        toast.warning("Tela nao declarada na navegacao", {
          description:
            "Esta rota nao existe na sncf_navegacao. Ela esta invisivel para todo mundo que nao e super_admin.",
          duration: 12000,
        });
      }
    })();
  }, [pathname, nav, isLoadingNav, avisarNaTela]);
}
