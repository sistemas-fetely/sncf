import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  usePermissoesDoUsuario,
  TELAS_PUBLICAS,
  temPermissaoTela,
} from "@/hooks/usePermissoesDoUsuario";

/**
 * Visibilidade de item de menu de lista fixa.
 * Mesma precedência e MESMOS helpers do RotaGate e do useSidebarApp
 * (temPermissaoTela / TELAS_PUBLICAS / useAuth().roles). O gate segue sendo a
 * última linha de defesa — esconder do menu não substitui a tranca.
 */
interface RegraNavegacaoMenu {
  rota: string;
  tela_slug: string | null;
  apenas_super_admin: boolean;
  status: string;
  ativo: boolean;
}

export function useVisibilidadeMenuFixo() {
  const { roles } = useAuth();
  const isSuperAdmin = (roles ?? []).includes("super_admin");
  const { data: permitidas, isLoading: carregandoPerms } = usePermissoesDoUsuario();

  const { data: regras, isLoading: carregandoNav } = useQuery({
    queryKey: ["navegacao-visibilidade-menu"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Map<string, RegraNavegacaoMenu>> => {
      const { data, error } = await supabase
        .from("sncf_navegacao")
        .select("rota, tela_slug, apenas_super_admin, status, ativo");
      if (error) throw error;
      const mapa = new Map<string, RegraNavegacaoMenu>();
      for (const r of data ?? []) {
        if (r.rota) mapa.set(r.rota, r as RegraNavegacaoMenu);
      }
      return mapa;
    },
  });

  const isLoading = carregandoNav || (!isSuperAdmin && carregandoPerms);

  const podeVer = (rota: string) => {
    if (isSuperAdmin) return true;
    const r = regras?.get(rota);
    // Item de menu fora da sncf_navegacao: mostra (sumir em silêncio é pior).
    if (!r) return true;
    if (!r.ativo) return false;
    if (r.status === "em_construcao") return false;
    if (r.apenas_super_admin) return false;
    if (!r.tela_slug) return true;
    if (TELAS_PUBLICAS.has(r.tela_slug)) return true;
    return temPermissaoTela(r.tela_slug, permitidas);
  };

  return { podeVer, isLoading };
}
