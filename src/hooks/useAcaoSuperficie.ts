import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatError } from "@/lib/format-error";

/**
 * CONSOLE DE AÇÕES — censo de superfície de ação (`acao_superficie`) cruzado
 * com o catálogo nominal (`permissoes_catalogo`) e os grupos de acesso.
 *
 * Nada de hardcode: rotas, riscos e grupos vêm todos do banco.
 * Convenção do projeto: em permissão de tipo `acao`, `pode_ver = true`
 * significa "pode EXECUTAR".
 */

export interface AcaoSuperficie {
  id: string;
  rota: string;
  arquivo: string | null;
  rotulo: string;
  dispara: string | null;
  guarda_atual: string | null;
  risco: string | null;
  permissao_id: string | null;
  conferido: boolean | null;
  conferido_por: string | null;
  conferido_em: string | null;
  origem: string | null;
  observacao: string | null;
  permissoes_catalogo?: { slug: string; nome_exibicao: string | null } | null;
}

export const CHAVE_ACOES_SUPERFICIE = ["acao-superficie"];
export const CHAVE_MATRIZ_GRUPO_PERMISSOES = ["grupo-acesso-permissoes-matriz"];

export function useAcoesSuperficie() {
  return useQuery({
    queryKey: CHAVE_ACOES_SUPERFICIE,
    queryFn: async (): Promise<AcaoSuperficie[]> => {
      const { data, error } = await supabase
        .from("acao_superficie")
        .select(
          "id, rota, arquivo, rotulo, dispara, guarda_atual, risco, permissao_id, conferido, conferido_por, conferido_em, origem, observacao, permissoes_catalogo(slug, nome_exibicao)",
        )
        .order("rota")
        .order("rotulo");
      if (error) throw error;
      return (data ?? []) as unknown as AcaoSuperficie[];
    },
  });
}

export interface GrupoConsole {
  id: string;
  nome: string;
  role_automatico: string | null;
}

export function useGruposConsole() {
  return useQuery({
    queryKey: ["grupos-acesso-console"],
    queryFn: async (): Promise<GrupoConsole[]> => {
      const { data, error } = await supabase
        .from("grupos_acesso")
        .select("id, nome, role_automatico")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as GrupoConsole[];
    },
  });
}

export interface CelulaPermissao {
  grupo_acesso_id: string;
  permissao_id: string;
  pode_ver: boolean | null;
}

/** Matriz completa (grupo × permissão) — uma leitura só para a tabela inteira. */
export function useMatrizGrupoPermissoes() {
  return useQuery({
    queryKey: CHAVE_MATRIZ_GRUPO_PERMISSOES,
    queryFn: async (): Promise<CelulaPermissao[]> => {
      const { data, error } = await supabase
        .from("grupo_acesso_permissoes")
        .select("grupo_acesso_id, permissao_id, pode_ver");
      if (error) throw error;
      return (data ?? []) as CelulaPermissao[];
    },
  });
}

/**
 * FAIL-LOUD: grava `conferido` + autor + timestamp. Erro sobe, toast aparece
 * e o React Query devolve o estado anterior (invalidação no settled).
 */
export function useMarcarConferido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ acaoId, valor }: { acaoId: string; valor: boolean }) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id ?? null;
      if (valor && !userId) throw new Error("Sessão expirada — entre novamente.");

      const { error } = await supabase
        .from("acao_superficie")
        .update({
          conferido: valor,
          conferido_por: valor ? userId : null,
          conferido_em: valor ? new Date().toISOString() : null,
        })
        .eq("id", acaoId);
      if (error) throw error;
    },
    onError: (e: unknown) => toast.error(formatError(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: CHAVE_ACOES_SUPERFICIE }),
  });
}
