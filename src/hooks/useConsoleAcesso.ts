import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatError } from "@/lib/format-error";

/**
 * CONSOLE DE ACESSO ÚNICO — fonte única `vw_console_acesso`: linhas de TELA e
 * linhas de AÇÃO no mesmo eixo módulo → tela.
 *
 * DIMENSÃO-VIA-TABELA: nenhum rótulo de módulo, ordem ou nome de tela é
 * hardcoded aqui. Convenção do projeto: em permissão de ação, `pode_ver = true`
 * significa "pode EXECUTAR".
 */
export interface ConsoleAcessoRow {
  linha_id: string;
  /** `escopo` = permissão sem botão: muda o que a pessoa enxerga, não o que clica. */
  tipo: "tela" | "acao" | "escopo";
  app_chave: string | null;
  app_label: string | null;
  app_ordem: number | null;
  /** Nível do meio da navegação: grupo dentro do módulo. Nulo = tela solta. */
  grupo_chave: string | null;
  grupo_label: string | null;
  grupo_ordem: number | null;
  item_chave: string | null;
  /** Em aba, é o rótulo da tela-mãe. */
  item_label: string | null;
  eh_aba: boolean | null;
  tela_ordem: number | null;
  tela_descricao: string | null;
  tela_label: string | null;
  rota: string;
  rotulo: string;
  dispara: string | null;
  arquivo: string | null;
  risco: string | null;
  guarda_atual: string | null;
  sem_guarda: boolean | null;
  permissao_id: string | null;
  permissao_slug: string | null;
  permissao_nome: string | null;
  declarada: boolean | null;
  /** > 1 → a permissão é um pacote: vale para várias telas. */
  telas_cobertas: number | null;
  telas_lista: string | null;
  contem_dado_sensivel: boolean | null;
  feature_em_teste: boolean | null;
  /** Tela governada por flag de papel, não por slug de grupo. */
  apenas_super_admin: boolean | null;
  acao_superficie_id: string | null;
  conferido: boolean | null;
  ordem_linha: number | null;
}

export const CHAVE_CONSOLE_ACESSO = ["console-acesso"];
export const CHAVE_MATRIZ_GRUPO_PERMISSOES = ["grupo-acesso-permissoes-matriz"];

export function useConsoleAcesso() {
  return useQuery({
    queryKey: CHAVE_CONSOLE_ACESSO,
    queryFn: async (): Promise<ConsoleAcessoRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_console_acesso")
        .select(
          "linha_id, tipo, app_chave, app_label, app_ordem, grupo_chave, grupo_label, grupo_ordem, item_chave, item_label, eh_aba, tela_ordem, tela_descricao, tela_label, rota, rotulo, dispara, arquivo, risco, guarda_atual, sem_guarda, permissao_id, permissao_slug, permissao_nome, declarada, telas_cobertas, telas_lista, contem_dado_sensivel, feature_em_teste, apenas_super_admin, acao_superficie_id, conferido, ordem_linha",
        )
        .order("app_ordem")
        .order("grupo_ordem")
        .order("tela_ordem")
        .order("ordem_linha");
      if (error) throw error;
      return (data ?? []) as ConsoleAcessoRow[];
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
  /** Alçada mínima DENTRO da concessão. Nulo = a concessão do grupo basta. */
  nivel_minimo: number | null;
}

/** Matriz completa (grupo × permissão) — uma leitura só para a grade inteira. */
export function useMatrizGrupoPermissoes() {
  return useQuery({
    queryKey: CHAVE_MATRIZ_GRUPO_PERMISSOES,
    queryFn: async (): Promise<CelulaPermissao[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("grupo_acesso_permissoes")
        .select("grupo_acesso_id, permissao_id, pode_ver, nivel_minimo");
      if (error) throw error;
      return (data ?? []) as CelulaPermissao[];
    },
  });
}

export interface PapelNivel {
  papel: string;
  nivel: number;
  rotulo: string;
}

/** DIMENSÃO-VIA-TABELA: os níveis e seus rótulos vêm sempre de `papel_nivel`. */
export function usePapeisNivel() {
  return useQuery({
    queryKey: ["papel-nivel"],
    queryFn: async (): Promise<PapelNivel[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("papel_nivel")
        .select("papel, nivel, rotulo")
        .eq("legado", false)
        .order("nivel");
      if (error) throw error;
      return (data ?? []) as PapelNivel[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Grava a alçada mínima da célula (grupo × permissão). FAIL-LOUD: erro sobe
 * com a mensagem real do banco e a matriz é reinvalidada no settled.
 */
export function useDefinirNivelMinimo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      grupoId,
      permissaoId,
      nivelMinimo,
    }: {
      grupoId: string;
      permissaoId: string;
      nivelMinimo: number | null;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("grupo_acesso_permissoes")
        .update({ nivel_minimo: nivelMinimo })
        .eq("grupo_acesso_id", grupoId)
        .eq("permissao_id", permissaoId);
      if (error) throw error;
    },
    onError: (e: unknown) => toast.error(formatError(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: CHAVE_MATRIZ_GRUPO_PERMISSOES }),
  });
}


/**
 * FAIL-LOUD: grava `conferido` + autor + timestamp. Erro sobe como toast e o
 * React Query devolve o estado anterior (invalidação no settled).
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
    onSettled: () => qc.invalidateQueries({ queryKey: CHAVE_CONSOLE_ACESSO }),
  });
}

/**
 * DECLARAR AÇÃO — cria o slug `acao.*` no catálogo via `fn_declarar_acao`
 * (idempotente, exige super_admin). Declarar NÃO concede nada a ninguém: só
 * abre o lugar onde a concessão pode ser gravada depois.
 */
export function useDeclararAcao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      acaoId,
      slug,
      nome,
    }: {
      acaoId: string;
      slug: string;
      nome: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("fn_declarar_acao", {
        p_acao_id: acaoId,
        p_slug: slug,
        p_nome: nome,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ação declarada no catálogo. Agora dá pra conceder por grupo.");
      qc.invalidateQueries({ queryKey: CHAVE_CONSOLE_ACESSO });
      qc.invalidateQueries({ queryKey: CHAVE_MATRIZ_GRUPO_PERMISSOES });
      qc.invalidateQueries({ queryKey: ["permissoes-catalogo"] });
    },
    onError: (e: unknown) => toast.error(formatError(e)),
  });
}

/**
 * Libera de uma vez todas as permissões declaradas de um conjunto de linhas
 * (tela inteira ou módulo inteiro) para um grupo. Só insere o que falta.
 */
export function useLiberarParaGrupo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      grupoId,
      permissaoIds,
    }: {
      grupoId: string;
      permissaoIds: string[];
    }) => {
      if (!permissaoIds.length) return;
      const rows = permissaoIds.map((permissao_id) => ({
        grupo_acesso_id: grupoId,
        permissao_id,
        pode_ver: true,
      }));
      const { error } = await supabase
        .from("grupo_acesso_permissoes")
        .upsert(rows, { onConflict: "grupo_acesso_id,permissao_id" });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Liberado."),
    onError: (e: unknown) => toast.error(formatError(e)),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: CHAVE_MATRIZ_GRUPO_PERMISSOES });
      qc.invalidateQueries({ queryKey: ["grupos-acesso-v2"] });
    },
  });
}

/** Sugestão de slug derivada do rótulo: acao.minusculas_com_underline. */
export function sugerirSlug(rotulo: string): string {
  const base = (rotulo ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return `acao.${base || "sem_rotulo"}`;
}
