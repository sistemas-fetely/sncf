import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Participantes de projeto (tarefas_projeto_membros) e a dimensão de papéis
 * (projeto_papel_dim). Papéis NUNCA são lista fixa no front — vêm da tabela.
 * FAIL-LOUD: await real, throw no erro, toast na falha.
 */

export interface PapelProjeto {
  codigo: string;
  nome: string;
  descricao: string | null;
  pode_editar_projeto: boolean;
  pode_editar_tarefas: boolean;
  ordem: number;
}

export function usePapeisProjeto() {
  return useQuery({
    queryKey: ["tarefas", "papeis-projeto"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PapelProjeto[]> => {
      const { data, error } = await supabase
        .from("projeto_papel_dim")
        .select("codigo,nome,descricao,pode_editar_projeto,pode_editar_tarefas,ordem")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as PapelProjeto[];
    },
  });
}

export interface MembroProjeto {
  id: string;
  projeto_id: string;
  user_id: string;
  papel: string;
  desde: string | null;
}

export function chaveMembros(projetoId: string) {
  return ["tarefas", "membros-projeto", projetoId];
}

export function useMembrosProjeto(projetoId: string | null) {
  return useQuery({
    queryKey: chaveMembros(projetoId ?? "nenhum"),
    enabled: !!projetoId,
    queryFn: async (): Promise<MembroProjeto[]> => {
      const { data, error } = await supabase
        .from("tarefas_projeto_membros")
        .select("id,projeto_id,user_id,papel,desde")
        .eq("projeto_id", projetoId!)
        .order("desde");
      if (error) throw error;
      return (data ?? []) as MembroProjeto[];
    },
  });
}

/** Papel do usuário logado em cada projeto que ele participa (uma leitura só). */
export function useMeusPapeisProjeto() {
  return useQuery({
    queryKey: ["tarefas", "meus-papeis-projeto"],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return {};
      const { data, error } = await supabase
        .from("tarefas_projeto_membros")
        .select("projeto_id,papel")
        .eq("user_id", uid);
      if (error) throw error;
      const mapa: Record<string, string> = {};
      for (const m of (data ?? []) as { projeto_id: string; papel: string }[]) {
        mapa[m.projeto_id] = m.papel;
      }
      return mapa;
    },
  });
}

function useInvalidarMembros(projetoId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: chaveMembros(projetoId) });
    qc.invalidateQueries({ queryKey: ["tarefas", "meus-papeis-projeto"] });
  };
}

export function useAdicionarMembro(projetoId: string) {
  const invalidar = useInvalidarMembros(projetoId);
  return useMutation({
    mutationFn: async ({ userId, papel }: { userId: string; papel: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("tarefas_projeto_membros").insert({
        projeto_id: projetoId,
        user_id: userId,
        papel,
        adicionado_por: auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success("Participante adicionado");
    },
    onError: (e: Error) => toast.error(`Não foi possível adicionar: ${e.message}`),
  });
}

export function useTrocarPapelMembro(projetoId: string) {
  const qc = useQueryClient();
  const invalidar = useInvalidarMembros(projetoId);
  return useMutation({
    mutationFn: async ({ id, papel }: { id: string; papel: string }) => {
      const { error } = await supabase
        .from("tarefas_projeto_membros")
        .update({ papel })
        .eq("id", id);
      if (error) throw error;
    },
    // otimista com rollback
    onMutate: async ({ id, papel }) => {
      const chave = chaveMembros(projetoId);
      await qc.cancelQueries({ queryKey: chave });
      const anterior = qc.getQueryData<MembroProjeto[]>(chave);
      qc.setQueryData<MembroProjeto[]>(chave, (atual) =>
        (atual ?? []).map((m) => (m.id === id ? { ...m, papel } : m))
      );
      return { anterior };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.anterior) qc.setQueryData(chaveMembros(projetoId), ctx.anterior);
      toast.error(`Não foi possível trocar o papel: ${e.message}`);
    },
    onSuccess: () => invalidar(),
  });
}

export function useRemoverMembro(projetoId: string) {
  const qc = useQueryClient();
  const invalidar = useInvalidarMembros(projetoId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tarefas_projeto_membros").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      const chave = chaveMembros(projetoId);
      await qc.cancelQueries({ queryKey: chave });
      const anterior = qc.getQueryData<MembroProjeto[]>(chave);
      qc.setQueryData<MembroProjeto[]>(chave, (atual) =>
        (atual ?? []).filter((m) => m.id !== id)
      );
      return { anterior };
    },
    onError: (e: Error, _id, ctx) => {
      if (ctx?.anterior) qc.setQueryData(chaveMembros(projetoId), ctx.anterior);
      toast.error(`Não foi possível remover: ${e.message}`);
    },
    onSuccess: () => {
      invalidar();
      toast.success("Participante removido");
    },
  });
}
