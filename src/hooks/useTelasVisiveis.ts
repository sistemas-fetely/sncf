import { useAuth } from "@/contexts/AuthContext";
import { usePermissoesDoUsuario, TELAS_PUBLICAS, temPermissaoTela } from "@/hooks/usePermissoesDoUsuario";
import { useNavegacaoPortao, resolverRegraNavegacao } from "@/hooks/useNavegacaoPortao";
import { resolverRegraRota } from "@/config/rotasRegistry";
import { useMemo } from "react";

/**
 * Decide quais rotas aparecem no menu, com EXATAMENTE a mesma precedência do
 * RotaGate: sncf_navegacao manda, rotasRegistry.ts é fallback.
 * Doutrina MENU-VIA-TABELA: menu e portão leem a mesma linha.
 */
export function useTelasVisiveis(rotas: string[]): Set<string> {
  const { roles } = useAuth();
  const isSuperAdmin = (roles ?? []).includes("super_admin");
  const { data: permitidas } = usePermissoesDoUsuario();
  const { data: nav } = useNavegacaoPortao();

  const chave = rotas.join("|");

  return useMemo(() => {
    const visiveis = new Set<string>();
    for (const rota of rotas) {
      if (isSuperAdmin) {
        visiveis.add(rota);
        continue;
      }

      const regraNav = resolverRegraNavegacao(rota, nav);
      const regraCodigo = resolverRegraRota(rota);
      if (!regraNav && !regraCodigo) continue; // rota não registrada → oculta

      const status = regraNav ? regraNav.status : regraCodigo!.status;
      const slug = regraNav ? regraNav.tela_slug : regraCodigo!.tela_slug;
      const apenasSuperAdmin = regraNav ? regraNav.apenas_super_admin : regraCodigo!.tela_slug === null;

      if (status === "em_construcao") continue; // paridade com o portão
      if (apenasSuperAdmin) continue;
      if (slug && TELAS_PUBLICAS.has(slug)) {
        visiveis.add(rota);
        continue;
      }
      if (temPermissaoTela(slug, permitidas)) visiveis.add(rota);
    }
    return visiveis;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, isSuperAdmin, permitidas, nav]);
}
