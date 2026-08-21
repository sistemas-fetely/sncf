import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { KEY_GESTAO } from "./useGestaoSalas";

/**
 * IDENTIDADE-DA-GESTAO-E-PESSOA_ID (20/08/2026): gestao_sala_membro.pessoa_id e
 * gestao_reuniao_participante.pessoa_id apontam para pessoas.id — NÃO para o id
 * do usuário no auth. Por isso o módulo Gestão resolve nomes e avatares por
 * vw_gestao_pessoa (chave pessoa_id), nunca por v_pessoas_sistema (chave =
 * usuario_id, usada corretamente pelo módulo Tarefas).
 */

export interface PessoaGestao {
  pessoa_id: string;
  nome: string;
  usuario_id: string | null;
  tem_login: boolean;
  email: string | null;
  cargo: string | null;
  departamento: string | null;
  avatar_url: string | null;
  tipo_vinculo: string | null;
}

export function usePessoasGestao() {
  return useQuery({
    queryKey: [...KEY_GESTAO, "pessoas"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PessoaGestao[]> => {
      const { data, error } = await supabase
        .from("vw_gestao_pessoa")
        .select("pessoa_id,nome,usuario_id,tem_login,email,cargo,departamento,avatar_url,tipo_vinculo")
        .order("nome");
      if (error) throw error;
      return (data ?? [])
        .filter((p) => p.pessoa_id && p.nome)
        .map((p) => ({
          pessoa_id: p.pessoa_id as string,
          nome: p.nome as string,
          usuario_id: p.usuario_id,
          tem_login: !!p.tem_login,
          email: p.email,
          cargo: p.cargo,
          departamento: p.departamento,
          avatar_url: p.avatar_url,
          tipo_vinculo: p.tipo_vinculo,
        }));
    },
  });
}

/** Resolve o nome a partir do pessoa_id (chave das tabelas gestao_*). */
export function useNomeDaPessoa() {
  const { data: pessoas } = usePessoasGestao();
  return (pessoaId: string | null | undefined) =>
    (pessoaId && pessoas?.find((p) => p.pessoa_id === pessoaId)?.nome) ||
    (pessoaId ? "Pessoa fora do catálogo" : "—");
}
