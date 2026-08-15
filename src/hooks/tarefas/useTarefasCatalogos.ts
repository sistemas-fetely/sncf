import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Catálogos usados pelo quick add e pelos combobox.
 * Pessoas vêm SEMPRE de v_pessoas_sistema — nunca de profiles direto.
 * O RLS de profiles bloqueia usuário comum e os nomes aparecem quebrados.
 */

export interface PessoaSistema {
  id: string;
  nome: string;
  email: string | null;
  cargo: string | null;
  avatar_url: string | null;
  departamento_id: string | null;
  departamento_nome: string | null;
}

export function usePessoasSistema() {
  return useQuery({
    queryKey: ["tarefas", "pessoas"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PessoaSistema[]> => {
      const { data, error } = await supabase
        .from("v_pessoas_sistema")
        .select("id,nome,email,cargo,avatar_url,departamento_id,departamento_nome")
        .eq("status", "ativo")
        .eq("origem", "colaborador")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as PessoaSistema[];
    },
  });
}

export interface ProjetoResumo {
  id: string;
  nome: string;
  cor: string;
  icone: string | null;
}

export function useProjetos() {
  return useQuery({
    queryKey: ["tarefas", "projetos"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ProjetoResumo[]> => {
      const { data, error } = await supabase
        .from("tarefas_projetos")
        .select("id,nome,cor,icone")
        .eq("status", "ativo")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as ProjetoResumo[];
    },
  });
}

export interface SecaoResumo {
  id: string;
  projeto_id: string;
  nome: string;
  ordem: number;
}

export function useSecoes(projetoId?: string | null) {
  return useQuery({
    queryKey: ["tarefas", "secoes", projetoId ?? "todas"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<SecaoResumo[]> => {
      let q = supabase.from("tarefas_secoes").select("id,projeto_id,nome,ordem").order("ordem");
      if (projetoId) q = q.eq("projeto_id", projetoId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SecaoResumo[];
    },
  });
}

export interface EtiquetaResumo {
  id: string;
  nome: string;
  cor: string;
}

export function useEtiquetas() {
  return useQuery({
    queryKey: ["tarefas", "etiquetas"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<EtiquetaResumo[]> => {
      const { data, error } = await supabase
        .from("tarefas_etiquetas")
        .select("id,nome,cor")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as EtiquetaResumo[];
    },
  });
}

/** casa nome digitado no quick add com um id do catálogo, sem acento e sem caixa */
export function casarPorNome<T extends { id: string; nome: string }>(
  itens: T[] | undefined,
  alvo: string | null
): string | null {
  if (!alvo || !itens?.length) return null;
  const chave = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const a = chave(alvo);
  return (
    itens.find((i) => chave(i.nome) === a)?.id ??
    itens.find((i) => chave(i.nome).startsWith(a))?.id ??
    null
  );
}
