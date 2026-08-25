import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Hook do módulo Grupos V2 (Sprint A 29/04/2026).
 *
 * Modelo simples: Grupo → tem N Permissões (V/C/E/A) → tem N Usuários.
 * Sem cargo, sem área, sem nível hierárquico.
 *
 * Tabelas:
 *  - grupos_acesso: lista de grupos (livres + pre_cadastrado=true são imutáveis)
 *  - permissoes_catalogo: catálogo de telas/fichas/processos por pilar
 *  - grupo_acesso_permissoes: matriz V/C/E/A
 *  - grupo_acesso_usuarios: vínculo direto user × grupo
 */

export interface GrupoAcesso {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  pre_cadastrado: boolean;
  ativo: boolean;
  qtd_usuarios: number;
  qtd_permissoes: number;
}

export interface PermissaoCatalogo {
  id: string;
  slug: string;
  tipo: "tela" | "ficha" | "processo";
  pilar: string;
  nome_exibicao: string;
  descricao: string | null;
  contem_dado_sensivel: boolean;
  feature_em_teste: boolean;
  ordem: number;
}

export interface GrupoPermissao {
  id: string;
  grupo_acesso_id: string;
  permissao_id: string;
  pode_ver: boolean;
  pode_criar: boolean;
  pode_editar: boolean;
  pode_apagar: boolean;
}

export interface GrupoUsuario {
  id: string;
  grupo_acesso_id: string;
  user_id: string;
  ativo_em: string;
  
  nome?: string;
  email?: string;
}

// =====================================================
// Lista de grupos com contagem
// =====================================================

export function useGruposAcessoV2(incluirInativos = false) {
  return useQuery({
    queryKey: ["grupos-acesso-v2", incluirInativos],
    queryFn: async (): Promise<GrupoAcesso[]> => {
      let query = supabase
        .from("grupos_acesso")
        .select("id, slug, nome, descricao, pre_cadastrado, ativo")
        .order("pre_cadastrado", { ascending: false })
        .order("nome");
      if (!incluirInativos) {
        query = query.eq("ativo", true);
      }
      const { data: grupos, error } = await query;
      if (error) throw error;

      // Contagens em queries paralelas (não bloqueantes)
      const ids = (grupos || []).map((g) => g.id);
      const [permsRes, usersRes] = await Promise.all([
        supabase
          .from("grupo_acesso_permissoes")
          .select("grupo_acesso_id")
          .in("grupo_acesso_id", ids),
        supabase
          .from("grupo_acesso_usuarios")
          .select("grupo_acesso_id")
          .in("grupo_acesso_id", ids),
      ]);

      const countPerms = new Map<string, number>();
      (permsRes.data || []).forEach((p: { grupo_acesso_id: string }) =>
        countPerms.set(p.grupo_acesso_id, (countPerms.get(p.grupo_acesso_id) || 0) + 1)
      );
      const countUsers = new Map<string, number>();
      (usersRes.data || []).forEach((u: { grupo_acesso_id: string }) =>
        countUsers.set(u.grupo_acesso_id, (countUsers.get(u.grupo_acesso_id) || 0) + 1)
      );

      return (grupos || []).map((g) => ({
        ...g,
        qtd_permissoes: countPerms.get(g.id) || 0,
        qtd_usuarios: countUsers.get(g.id) || 0,
      }));
    },
  });
}

// =====================================================
// Catálogo de permissões (agrupado por pilar)
// =====================================================

export function usePermissoesCatalogo() {
  return useQuery({
    queryKey: ["permissoes-catalogo"],
    queryFn: async (): Promise<PermissaoCatalogo[]> => {
      const { data, error } = await supabase
        .from("permissoes_catalogo")
        .select("*")
        .eq("ativo", true)
        .order("pilar")
        .order("ordem")
        .order("nome_exibicao");
      if (error) throw error;
      return (data || []) as PermissaoCatalogo[];
    },
  });
}

// =====================================================
// Permissões de UM grupo
// =====================================================

export function usePermissoesDoGrupo(grupoId: string | null) {
  return useQuery({
    queryKey: ["grupo-permissoes", grupoId],
    enabled: !!grupoId,
    queryFn: async (): Promise<GrupoPermissao[]> => {
      const { data, error } = await supabase
        .from("grupo_acesso_permissoes")
        .select("*")
        .eq("grupo_acesso_id", grupoId);
      if (error) throw error;
      return (data || []) as GrupoPermissao[];
    },
  });
}

// =====================================================
// Usuários de UM grupo
// =====================================================

export function useUsuariosDoGrupo(grupoId: string | null) {
  return useQuery({
    queryKey: ["grupo-usuarios", grupoId],
    enabled: !!grupoId,
    queryFn: async (): Promise<GrupoUsuario[]> => {
      const { data: vinculos, error } = await supabase
        .from("grupo_acesso_usuarios")
        .select("*")
        .eq("grupo_acesso_id", grupoId);
      if (error) throw error;

      const userIds = (vinculos || []).map((v) => v.user_id);
      if (userIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      const profMap = new Map(
        (profiles || []).map((p) => [p.user_id, p])
      );

      return (vinculos || []).map((v) => ({
        ...v,
        nome: profMap.get(v.user_id)?.full_name || "(sem nome)",
        email: "",
      }));
    },
  });
}

// =====================================================
// Mutations — Grupo
// =====================================================

export function useCriarGrupo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      nome,
      descricao,
    }: {
      nome: string;
      descricao?: string;
    }) => {
      const slug = nome
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const { data, error } = await supabase
        .from("grupos_acesso")
        .insert({
          nome,
          descricao: descricao || null,
          slug,
          pre_cadastrado: false,
          ativo: true,
          tipo_colaborador: "ambos",
          // role_automatico fica com default do banco (legado, não usado)
        })
        .select()
        .single();
      if (error) {
        if (
          error.code === "23505" ||
          error.message?.includes("grupos_acesso_slug_key")
        ) {
          const { data: existente } = await supabase
            .from("grupos_acesso")
            .select("nome, ativo")
            .eq("slug", slug)
            .maybeSingle();
          if (existente) {
            if (existente.ativo === false) {
              throw new Error(
                `Já existe um grupo chamado "${existente.nome}", mas ele está desativado. Use "Mostrar inativos" para reativá-lo, ou escolha outro nome.`
              );
            }
            throw new Error(
              `Já existe um grupo chamado "${existente.nome}". Escolha outro nome.`
            );
          }
          throw new Error(
            "Já existe um grupo com esse nome. Escolha outro."
          );
        }
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grupos-acesso-v2"] });
      toast.success("Grupo criado");
    },
    onError: (e: Error) => toast.error(`Erro ao criar grupo: ${e.message}`),
  });
}

export function useEditarGrupo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      nome,
      descricao,
    }: {
      id: string;
      nome: string;
      descricao?: string;
    }) => {
      const { error } = await supabase
        .from("grupos_acesso")
        .update({ nome, descricao: descricao || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grupos-acesso-v2"] });
      toast.success("Grupo atualizado");
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useExcluirGrupo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Pre_cadastrado não pode deletar
      const { data: g } = await supabase
        .from("grupos_acesso")
        .select("pre_cadastrado")
        .eq("id", id)
        .single();
      if (g?.pre_cadastrado) {
        throw new Error("Grupo pré-cadastrado não pode ser deletado");
      }
      // DELETAR-É-DELETAR (23/08/2026): soft delete escondia o grupo da lista mas mantinha o slug ocupado no índice único, gerando erro de chave duplicada na criação. FKs em cascade removem permissões e vínculos junto.
      const { error } = await supabase
        .from("grupos_acesso")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grupos-acesso-v2"] });
      toast.success("Grupo excluído");
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useReativarGrupo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("grupos_acesso").update({ ativo: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grupos-acesso-v2"] });
      toast.success("Grupo reativado");
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

// =====================================================
// Mutations — Permissão de grupo (V/C/E/A)
// =====================================================

export function useTogglePermissao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      grupoId,
      permissaoId,
      campo,
      valor,
    }: {
      grupoId: string;
      permissaoId: string;
      campo: "pode_ver" | "pode_criar" | "pode_editar" | "pode_apagar";
      valor: boolean;
    }) => {
      // Upsert: cria linha se não existir, atualiza se existir
      const { data: existing } = await supabase
        .from("grupo_acesso_permissoes")
        .select("id")
        .eq("grupo_acesso_id", grupoId)
        .eq("permissao_id", permissaoId)
        .maybeSingle();

      if (existing) {
        const updatePayload: Record<string, boolean> = { [campo]: valor };
        const { error } = await supabase
          .from("grupo_acesso_permissoes")
          .update(updatePayload as never)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("grupo_acesso_permissoes")
          .insert({
            grupo_acesso_id: grupoId,
            permissao_id: permissaoId,
            pode_ver: campo === "pode_ver" ? valor : false,
            pode_criar: campo === "pode_criar" ? valor : false,
            pode_editar: campo === "pode_editar" ? valor : false,
            pode_apagar: campo === "pode_apagar" ? valor : false,
          });
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["grupo-permissoes", vars.grupoId] });
      queryClient.invalidateQueries({ queryKey: ["grupos-acesso-v2"] });
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useLiberarPilar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      grupoId,
      pilar,
    }: {
      grupoId: string;
      pilar: string;
    }) => {
      // Pega todas as permissões do pilar
      const { data: perms } = await supabase
        .from("permissoes_catalogo")
        .select("id, tipo")
        .eq("pilar", pilar)
        .eq("ativo", true);
      if (!perms?.length) return;

      // Upsert massivo (1 linha por permissão)
      const rows = perms.map((p) => ({
        grupo_acesso_id: grupoId,
        permissao_id: p.id,
        pode_ver: true,
        pode_criar: p.tipo === "ficha",
        pode_editar: p.tipo === "ficha",
        pode_apagar: p.tipo === "ficha",
      }));

      const { error } = await supabase
        .from("grupo_acesso_permissoes")
        .upsert(rows, { onConflict: "grupo_acesso_id,permissao_id" });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["grupo-permissoes", vars.grupoId] });
      queryClient.invalidateQueries({ queryKey: ["grupos-acesso-v2"] });
      toast.success("Pilar liberado");
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

// =====================================================
// Mutations — Usuário em grupo
// =====================================================

export function useAdicionarUsuarioAoGrupo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      grupoId,
      userId,
    }: {
      grupoId: string;
      userId: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("grupo_acesso_usuarios")
        .upsert(
          {
            grupo_acesso_id: grupoId,
            user_id: userId,
            adicionado_por: user?.id || null,
          },
          { onConflict: "grupo_acesso_id,user_id" }
        );
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["grupo-usuarios", vars.grupoId] });
      queryClient.invalidateQueries({ queryKey: ["grupos-acesso-v2"] });
      queryClient.invalidateQueries({ queryKey: ["grupo-acesso-vinculo"] });
      queryClient.invalidateQueries({ queryKey: ["mesa-grupos-usuarios"] });
      queryClient.invalidateQueries({ queryKey: ["permissoes-telas"] });
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      toast.success("Usuário adicionado ao grupo");
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useRemoverUsuarioDoGrupo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      grupoId,
      userId,
    }: {
      grupoId: string;
      userId: string;
    }) => {
      // Vínculo é estado puro: remover = DELETE (histórico fica em acesso_dados_log)
      const { error } = await supabase
        .from("grupo_acesso_usuarios")
        .delete()
        .eq("grupo_acesso_id", grupoId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["grupo-usuarios", vars.grupoId] });
      queryClient.invalidateQueries({ queryKey: ["grupos-acesso-v2"] });
      queryClient.invalidateQueries({ queryKey: ["grupo-acesso-vinculo"] });
      queryClient.invalidateQueries({ queryKey: ["mesa-grupos-usuarios"] });
      queryClient.invalidateQueries({ queryKey: ["permissoes-telas"] });
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      toast.success("Usuário removido do grupo");
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}
