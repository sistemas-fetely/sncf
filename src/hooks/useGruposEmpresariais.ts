/**
 * useGruposEmpresariais — hook canônico de leitura/gerenciamento de grupos.
 *
 * Padrão Doutrina #14 (dimensão sempre via tabela): nunca hardcode lista de
 * grupos em código. Quem precisa ler grupos importa daqui.
 *
 * VERSÃO FASE 3: adicionadas mutations CRUD completas + hook parceirosDoGrupo
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type GrupoEmpresarial = {
  id: string;
  nome: string;
  descricao: string | null;
  cnpj_raiz: string | null;
  tipo_controle: string | null;
  observacao: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
};

export type TipoControle =
  | "holding_formal"
  | "mesmo_dono"
  | "controle_indireto"
  | "agrupamento_operacional"
  | "outro";

export const TIPO_CONTROLE_LABELS: Record<TipoControle, string> = {
  holding_formal: "Holding formal",
  mesmo_dono: "Mesmo dono",
  controle_indireto: "Controle indireto",
  agrupamento_operacional: "Agrupamento operacional",
  outro: "Outro",
};

export const TIPO_CONTROLE_BADGE: Record<TipoControle, string> = {
  holding_formal: "bg-info/10 text-info hover:bg-info/10",
  mesmo_dono: "bg-info/10 text-info hover:bg-info/10",
  controle_indireto: "bg-info/10 text-info hover:bg-info/10",
  agrupamento_operacional: "bg-warning/10 text-warning hover:bg-warning/10",
  outro: "bg-muted/10 text-muted-foreground hover:bg-muted/10",
};

// ==========================================================================
// LEITURA
// ==========================================================================

/**
 * Lista todos os grupos empresariais.
 * @param somenteAtivos se true, filtra ativo=true (default: true)
 */
export function useGruposEmpresariais(somenteAtivos: boolean = true) {
  return useQuery({
    queryKey: ["grupos-empresariais", { somenteAtivos }],
    queryFn: async () => {
      let query = supabase
        .from("grupos_empresariais")
        .select("*")
        .order("nome");

      if (somenteAtivos) {
        query = query.eq("ativo", true);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as GrupoEmpresarial[];
    },
  });
}

/**
 * Lista parceiros vinculados a um grupo específico.
 * Usado pela seção "Parceiros vinculados" do GrupoFormSheet.
 */
export function useParceirosDoGrupo(grupoId: string | null) {
  return useQuery({
    queryKey: ["parceiros-do-grupo", grupoId],
    queryFn: async () => {
      if (!grupoId) return [];
      const { data, error } = await supabase
        .from("parceiros_comerciais")
        .select("id, razao_social, nome_fantasia, cnpj, ativo, tipos")
        .eq("grupo_id", grupoId)
        .order("razao_social");
      if (error) throw error;
      return data || [];
    },
    enabled: !!grupoId,
  });
}

// ==========================================================================
// MUTATIONS
// ==========================================================================

/**
 * Mutation para criação INLINE rápida (só nome).
 * Usado pelo GrupoEmpresarialCombobox (Fase 2).
 */
export function useCriarGrupoRapido() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (nome: string): Promise<GrupoEmpresarial> => {
      const nomeTrim = nome.trim();
      if (!nomeTrim) throw new Error("Nome do grupo é obrigatório");

      const { data, error } = await supabase
        .from("grupos_empresariais")
        .insert({ nome: nomeTrim })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          throw new Error(`Já existe um grupo com o nome "${nomeTrim}"`);
        }
        throw error;
      }
      return data as GrupoEmpresarial;
    },
    onSuccess: (grupo) => {
      queryClient.invalidateQueries({ queryKey: ["grupos-empresariais"] });
      queryClient.invalidateQueries({ queryKey: ["exposicao-grupos"] });
      toast.success(`Grupo "${grupo.nome}" criado`, {
        description:
          "Edite descrição, tipo de controle e observações em Parceiros → Grupos.",
      });
    },
    onError: (error: Error) => {
      toast.error("Erro ao criar grupo", { description: error.message });
    },
  });
}

export type GrupoInput = {
  nome: string;
  descricao?: string | null;
  cnpj_raiz?: string | null;
  tipo_controle?: TipoControle | null;
  observacao?: string | null;
  ativo?: boolean;
};

/**
 * Mutation para criar grupo COMPLETO (todos os campos).
 * Usado pelo GrupoFormSheet (Fase 3).
 */
export function useCriarGrupo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: GrupoInput): Promise<GrupoEmpresarial> => {
      const nomeTrim = input.nome.trim();
      if (!nomeTrim) throw new Error("Nome do grupo é obrigatório");

      const payload = {
        nome: nomeTrim,
        descricao: input.descricao?.trim() || null,
        cnpj_raiz: input.cnpj_raiz?.trim() || null,
        tipo_controle: input.tipo_controle || null,
        observacao: input.observacao?.trim() || null,
        ativo: input.ativo ?? true,
      };

      const { data, error } = await supabase
        .from("grupos_empresariais")
        .insert(payload)
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          throw new Error(`Já existe um grupo com o nome "${nomeTrim}"`);
        }
        throw error;
      }
      return data as GrupoEmpresarial;
    },
    onSuccess: (grupo) => {
      queryClient.invalidateQueries({ queryKey: ["grupos-empresariais"] });
      queryClient.invalidateQueries({ queryKey: ["exposicao-grupos"] });
      toast.success(`Grupo "${grupo.nome}" criado`);
    },
    onError: (error: Error) => {
      toast.error("Erro ao criar grupo", { description: error.message });
    },
  });
}

/**
 * Mutation para editar grupo existente.
 */
export function useEditarGrupo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: GrupoInput & { id: string }): Promise<GrupoEmpresarial> => {
      const nomeTrim = input.nome.trim();
      if (!nomeTrim) throw new Error("Nome do grupo é obrigatório");

      const payload = {
        nome: nomeTrim,
        descricao: input.descricao?.trim() || null,
        cnpj_raiz: input.cnpj_raiz?.trim() || null,
        tipo_controle: input.tipo_controle || null,
        observacao: input.observacao?.trim() || null,
        ativo: input.ativo ?? true,
      };

      const { data, error } = await supabase
        .from("grupos_empresariais")
        .update(payload)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          throw new Error(`Já existe outro grupo com o nome "${nomeTrim}"`);
        }
        throw error;
      }
      return data as GrupoEmpresarial;
    },
    onSuccess: (grupo) => {
      queryClient.invalidateQueries({ queryKey: ["grupos-empresariais"] });
      queryClient.invalidateQueries({ queryKey: ["exposicao-grupos"] });
      queryClient.invalidateQueries({ queryKey: ["parceiros"] });
      toast.success(`Grupo "${grupo.nome}" atualizado`);
    },
    onError: (error: Error) => {
      toast.error("Erro ao atualizar grupo", { description: error.message });
    },
  });
}

/**
 * Mutation espelhando padrão Parceiros.tsx:
 * - Grupo COM parceiros vinculados → INATIVA (preserva histórico)
 * - Grupo SEM parceiros → EXCLUI de fato
 */
export function useExcluirOuInativarGrupo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      grupoId: string,
    ): Promise<{ acao: "inativado" | "excluido"; qtdParceiros: number }> => {
      const { count } = await supabase
        .from("parceiros_comerciais")
        .select("id", { count: "exact", head: true })
        .eq("grupo_id", grupoId);

      const qtdParceiros = count || 0;

      if (qtdParceiros > 0) {
        const { error } = await supabase
          .from("grupos_empresariais")
          .update({ ativo: false })
          .eq("id", grupoId);
        if (error) throw error;
        return { acao: "inativado", qtdParceiros };
      } else {
        const { error } = await supabase
          .from("grupos_empresariais")
          .delete()
          .eq("id", grupoId);
        if (error) throw error;
        return { acao: "excluido", qtdParceiros: 0 };
      }
    },
    onSuccess: ({ acao, qtdParceiros }) => {
      queryClient.invalidateQueries({ queryKey: ["grupos-empresariais"] });
      queryClient.invalidateQueries({ queryKey: ["exposicao-grupos"] });
      queryClient.invalidateQueries({ queryKey: ["parceiros"] });
      if (acao === "inativado") {
        toast.success(
          `Grupo inativado (tem ${qtdParceiros} parceiro${qtdParceiros === 1 ? "" : "s"} vinculado${qtdParceiros === 1 ? "" : "s"} — não pode ser excluído)`,
        );
      } else {
        toast.success("Grupo excluído");
      }
    },
    onError: (error: Error) => {
      toast.error("Erro ao excluir grupo", { description: error.message });
    },
  });
}
