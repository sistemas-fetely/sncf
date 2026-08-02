import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { nomePessoaPJ } from "@/lib/parceiros/nome";

export interface GestorDisponivel {
  /** profile.id do gestor — valor a ser salvo em gestor_direto_id */
  profile_id: string;
  user_id: string;
  nome: string;
  cargo: string;
  departamento: string | null;
  foto_url: string | null;
  vinculo: "CLT" | "PJ";
  pessoa_id: string;
}

/**
 * Lista todas as pessoas (colaboradores CLT ativos + contratos PJ ativos)
 * que possuem usuário no sistema (user_id), para serem selecionadas como
 * "Gestor Líder". Retorna o profile.id de cada uma — esse é o valor que
 * deve ser gravado em colaboradores_clt.gestor_direto_id ou contratos_pj.gestor_direto_id.
 *
 * Esse select substitui a antiga lista de "profiles" e mantém integração
 * automática com o organograma via triggers no banco.
 */
export function useGestoresDisponiveis() {
  return useQuery({
    queryKey: ["gestores-disponiveis"],
    queryFn: async (): Promise<GestorDisponivel[]> => {
      const [cltRes, pjRes, profRes] = await Promise.all([
        supabase
          .from("colaboradores_clt")
          .select("id, user_id, nome_completo, cargo, departamento, foto_url, status")
          .eq("status", "ativo")
          .not("user_id", "is", null),
        supabase
          .from("contratos_pj")
          .select("id, user_id, contato_nome, nome_fantasia, razao_social, tipo_servico, departamento, foto_url, status")
          .eq("status", "ativo")
          .not("user_id", "is", null),
        supabase.from("profiles").select("id, user_id"),
      ]);

      const userToProfile = new Map<string, string>();
      (profRes.data || []).forEach((p: any) => {
        if (p.user_id) userToProfile.set(p.user_id, p.id);
      });

      const lista: GestorDisponivel[] = [];

      (cltRes.data || []).forEach((c: any) => {
        const profileId = userToProfile.get(c.user_id);
        if (!profileId) return;
        lista.push({
          profile_id: profileId,
          user_id: c.user_id,
          nome: c.nome_completo,
          cargo: c.cargo,
          departamento: c.departamento,
          foto_url: c.foto_url,
          vinculo: "CLT",
          pessoa_id: c.id,
        });
      });

      (pjRes.data || []).forEach((p: any) => {
        const profileId = userToProfile.get(p.user_id);
        if (!profileId) return;
        lista.push({
          profile_id: profileId,
          user_id: p.user_id,
          nome: nomePessoaPJ(p.contato_nome, p.razao_social, ""),
          cargo: p.tipo_servico || "PJ",
          departamento: p.departamento,
          foto_url: p.foto_url,
          vinculo: "PJ",
          pessoa_id: p.id,
        });
      });

      return lista.sort((a, b) => a.nome.localeCompare(b.nome));
    },
  });
}
