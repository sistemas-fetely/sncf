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

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * Apelido operacional da pessoa = parte local do e-mail.
 * Sem espaço por construção (o parser corta o token no espaço) e único por
 * construção (é um e-mail). É também como as pessoas se chamam aqui: nathy, não Nathalia.
 */
export function handlePessoa(p: { email: string | null }): string | null {
  const local = (p.email ?? "").split("@")[0]?.trim().toLowerCase();
  return local || null;
}

/** Todos os termos pelos quais uma pessoa pode ser chamada no quick add. */
export function termosPessoa(p: PessoaSistema): string[] {
  const h = handlePessoa(p);
  const doHandle = h ? [h, ...h.split(".")] : [];
  return [...semAcento(p.nome).split(/\s+/), ...doHandle].filter(Boolean);
}

/** Resolve o texto de @alvo numa pessoa. Handle exato vence; depois termo exato; depois prefixo. */
export function casarPessoa(
  pessoas: PessoaSistema[] | undefined,
  alvo: string | null
): PessoaSistema | null {
  if (!alvo || !pessoas?.length) return null;
  const a = semAcento(alvo);
  return (
    pessoas.find((p) => handlePessoa(p) === a) ??
    pessoas.find((p) => termosPessoa(p).some((t) => t === a)) ??
    pessoas.find((p) => termosPessoa(p).some((t) => t.startsWith(a))) ??
    null
  );
}

/** Candidatos do dropdown. Fragmento vazio (acabou de digitar "@") mostra todo mundo. */
export function sugerirPessoas(
  pessoas: PessoaSistema[] | undefined,
  fragmento: string
): PessoaSistema[] {
  if (!pessoas?.length) return [];
  const a = semAcento(fragmento);
  if (!a) return pessoas.slice(0, 6);
  return pessoas.filter((p) => termosPessoa(p).some((t) => t.startsWith(a))).slice(0, 6);
}

export interface TipoExecucaoTarefa {
  codigo: string;
  nome: string;
  descricao: string | null;
  gera_instancia: boolean;
  instancia_unica: boolean;
  exige_prova_sistema: boolean;
  ordem: number;
}

/** Dimensão de tipos de execução da recorrência — a lista vem SEMPRE da tabela. */
export function useTiposExecucaoTarefa() {
  return useQuery({
    queryKey: ["tarefas", "tipos-execucao"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<TipoExecucaoTarefa[]> => {
      const { data, error } = await supabase
        .from("tarefa_execucao_tipo_dim")
        .select("codigo,nome,descricao,gera_instancia,instancia_unica,exige_prova_sistema,ordem")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as TipoExecucaoTarefa[];
    },
  });
}

export interface NaturezaTarefa {
  codigo: string;
  nome: string;
  descricao: string | null;
  conta_carga: boolean;
  na_lista_de_trabalho: boolean;
  ordem: number;
}

/** Dimensão de natureza da tarefa — a lista vem SEMPRE da tabela, nunca hardcode. */
export function useNaturezasTarefa() {
  return useQuery({
    queryKey: ["tarefas", "naturezas"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<NaturezaTarefa[]> => {
      const { data, error } = await supabase
        .from("tarefa_natureza_dim")
        .select("codigo,nome,descricao,conta_carga,na_lista_de_trabalho,ordem")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as NaturezaTarefa[];
    },
  });
}

/**
 * Mapa id da tarefa -> natureza, só das que NÃO são operacionais.
 * Existe porque algumas listas leem de vw_tarefa_meu_papel / RPC de carga,
 * que não expõem a coluna. Lista curta por definição (épico e backlog).
 */
export function useNaturezaExcecoes() {
  return useQuery({
    queryKey: ["tarefas", "natureza-excecoes"],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from("tarefas")
        .select("id,natureza")
        .neq("natureza", "operacional");
      if (error) throw error;
      const mapa: Record<string, string> = {};
      for (const l of (data ?? []) as { id: string; natureza: string | null }[]) {
        if (l.natureza) mapa[l.id] = l.natureza;
      }
      return mapa;
    },
  });
}
