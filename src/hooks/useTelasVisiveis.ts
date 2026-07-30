import { useAuth } from "@/contexts/AuthContext";
import { usePermissoesDoUsuario, TELAS_PUBLICAS, temPermissaoTela } from "@/hooks/usePermissoesDoUsuario";
import { useRotasConfig, resolverRegraRotaBanco } from "@/hooks/useRotasConfig";
import { resolverRegraRota } from "@/config/rotasRegistry";
import { useMemo } from "react";

/**
 * Decide quais rotas devem aparecer no menu, usando EXATAMENTE a mesma
 * precedência do RotaGate: regra do banco vence; código é fallback.
 * Doutrina MENU-VIA-TABELA: menu e portão leem a mesma linha.
 */
export function useTelasVisiveis(rotas: string[]): Set<string> {
  const { roles } = useAuth();
  const isSuperAdmin = (roles ?? []).includes("super_admin");
  const { data: permitidas } = usePermissoesDoUsuario();
  const { data: rotasBanco } = useRotasConfig();

  const chave = rotas.join("|");

  return useMemo(() => {
    const visiveis = new Set<string>();
    for (const rota of rotas) {
      if (isSuperAdmin) {
        visiveis.add(rota);
        continue;
      }

      const regra = resolverRegraRotaBanco(rota, rotasBanco) ?? resolverRegraRota(rota);
      if (!regra) continue; // rota não registrada → oculta
      if (regra.status === "em_construcao") continue; // paridade com o portão
      const slug = regra.tela_slug ?? null;
      if (slug && TELAS_PUBLICAS.has(slug)) {
        visiveis.add(rota);
        continue;
      }
      if (temPermissaoTela(slug, permitidas)) visiveis.add(rota);
    }
    return visiveis;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, isSuperAdmin, permitidas, rotasBanco]);
}
