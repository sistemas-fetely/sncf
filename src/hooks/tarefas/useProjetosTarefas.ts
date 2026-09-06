import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { codigosAbertos } from "./useStatusTarefaDim";
import { toast } from "sonner";
import type { Tarefa } from "./useTarefas";

/**
 * Projetos, seções e board (F3).
 * FAIL-LOUD: await real, throw no erro, toast na falha.
 * Pessoas nunca vêm de profiles — quem precisa de nome usa usePessoasSistema().
 */

export type ProjetoSaude = "no_prazo" | "em_risco" | "atrasado";
export type ProjetoVisibilidade = "publica" | "departamento" | "privada";
export type ProjetoStatus = "ativo" | "arquivado" | "encerrado";

export interface Projeto {
  id: string;
  nome: string;
  descricao: string | null;
  departamento_id: string | null;
  responsavel_id: string | null;
  cor: string;
  icone: string | null;
  visibilidade: ProjetoVisibilidade;
  status: ProjetoStatus;
  data_inicio: string | null;
  data_fim_prevista: string | null;
  saude: ProjetoSaude;
  saude_atualizada_em: string | null;
  criado_em: string;
  criado_por: string | null;
}

const CAMPOS_PROJETO =
  "id,nome,descricao,departamento_id,responsavel_id,cor,icone,visibilidade,status,data_inicio,data_fim_prevista,saude,saude_atualizada_em,criado_em,criado_por" as const;

export const SAUDE_ROTULO: Record<ProjetoSaude, string> = {
  no_prazo: "No prazo",
  em_risco: "Em risco",
  atrasado: "Atrasado",
};

export const SAUDE_CLASSE: Record<ProjetoSaude, string> = {
  no_prazo: "border-success/40 bg-success/10 text-success",
  em_risco: "border-warning/40 bg-warning/10 text-warning",
  atrasado: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function useProjetosLista(incluirArquivados = false) {
  return useQuery({
    queryKey: ["tarefas", "projetos-lista", incluirArquivados],
    queryFn: async (): Promise<Projeto[]> => {
      let q = supabase.from("tarefas_projetos").select(CAMPOS_PROJETO).order("nome");
      if (!incluirArquivados) q = q.eq("status", "ativo");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Projeto[];
    },
  });
}

/** contagem de tarefas abertas por projeto, em uma leitura só */
export function useContagemAbertasPorProjeto() {
  return useQuery({
    queryKey: ["tarefas", "contagem-abertas-projeto"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from("tarefas")
        .select("projeto_id")
        .in("status", await codigosAbertos())
        .not("projeto_id", "is", null);
      if (error) throw error;
      const mapa: Record<string, number> = {};
      for (const linha of data ?? []) {
        const id = (linha as { projeto_id: string | null }).projeto_id;
        if (id) mapa[id] = (mapa[id] ?? 0) + 1;
      }
      return mapa;
    },
  });
}

export function useProjeto(id: string | null) {
  return useQuery({
    queryKey: ["tarefas", "projeto", id ?? "nenhum"],
    enabled: !!id,
    queryFn: async (): Promise<Projeto> => {
      const { data, error } = await supabase
        .from("tarefas_projetos")
        .select(CAMPOS_PROJETO)
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as Projeto;
    },
  });
}

export interface NovoProjeto {
  nome: string;
  descricao: string | null;
  cor: string;
  visibilidade: ProjetoVisibilidade;
  responsavel_id: string | null;
  data_inicio: string | null;
  data_fim_prevista: string | null;
}

export function useCriarProjeto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (novo: NovoProjeto): Promise<string> => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("tarefas_projetos")
        .insert({ ...novo, criado_por: auth.user?.id ?? null })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tarefas"] });
      toast.success("Projeto criado");
    },
    onError: (e: Error) => toast.error(`Não foi possível criar o projeto: ${e.message}`),
  });
}

export function useSalvarProjeto(projetoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      patch: Partial<NovoProjeto> & {
        saude?: ProjetoSaude;
        status?: ProjetoStatus;
        tipo?: string;
        icone?: string | null;
        departamento_id?: string | null;
        cadencia_checkin_dias?: number;
      }
    ) => {
      const { error } = await supabase.from("tarefas_projetos").update(patch).eq("id", projetoId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tarefas"] }),
    onError: (e: Error) => toast.error(`Não foi possível salvar o projeto: ${e.message}`),
  });
}

/** RPC de gestão: habilita/desabilita as ações administrativas do projeto */
export function usePodeGerenciarProjeto(projetoId: string | null) {
  return useQuery({
    queryKey: ["tarefas", "pode-gerenciar", projetoId ?? "nenhum"],
    enabled: !!projetoId,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc("tarefas_pode_gerenciar_projeto", {
        _projeto_id: projetoId!,
      });
      if (error) throw error;
      return !!data;
    },
  });
}

export function usePodeAprovarTarefas(userId: string | undefined) {
  return useQuery({
    queryKey: ["tarefas", "pode-aprovar", userId],
    enabled: !!userId,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc("tem_nivel", {
        _nivel: 3,
        _user_id: userId!,
      });
      if (error) throw error;
      return !!data;
    },
  });
}

// ————————————————————————— seções —————————————————————————

export interface Secao {
  id: string;
  projeto_id: string;
  nome: string;
  ordem: number;
  cor: string | null;
}

export function chaveSecoes(projetoId: string) {
  return ["tarefas", "secoes-projeto", projetoId];
}

export function useSecoesProjeto(projetoId: string | null) {
  return useQuery({
    queryKey: chaveSecoes(projetoId ?? "nenhum"),
    enabled: !!projetoId,
    queryFn: async (): Promise<Secao[]> => {
      const { data, error } = await supabase
        .from("tarefas_secoes")
        .select("id,projeto_id,nome,ordem,cor")
        .eq("projeto_id", projetoId!)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as Secao[];
    },
  });
}

function useInvalidarProjeto(projetoId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["tarefas"] });
    qc.invalidateQueries({ queryKey: chaveSecoes(projetoId) });
  };
}

export function useCriarSecao(projetoId: string) {
  const invalidar = useInvalidarProjeto(projetoId);
  return useMutation({
    mutationFn: async ({ nome, ordem }: { nome: string; ordem: number }) => {
      const { error } = await supabase
        .from("tarefas_secoes")
        .insert({ projeto_id: projetoId, nome, ordem });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success("Seção criada");
    },
    onError: (e: Error) => toast.error(`Não foi possível criar a seção: ${e.message}`),
  });
}

export function useRenomearSecao(projetoId: string) {
  const invalidar = useInvalidarProjeto(projetoId);
  return useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }) => {
      const { error } = await supabase.from("tarefas_secoes").update({ nome }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidar(),
    onError: (e: Error) => toast.error(`Não foi possível renomear: ${e.message}`),
  });
}

export function useReordenarSecoes(projetoId: string) {
  const invalidar = useInvalidarProjeto(projetoId);
  return useMutation({
    mutationFn: async (ordenadas: { id: string; ordem: number }[]) => {
      for (const s of ordenadas) {
        const { error } = await supabase
          .from("tarefas_secoes")
          .update({ ordem: s.ordem })
          .eq("id", s.id);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidar(),
    onError: (e: Error) => toast.error(`Não foi possível reordenar: ${e.message}`),
  });
}

/**
 * Excluir seção NÃO apaga tarefa: primeiro solta as tarefas (secao_id = null),
 * elas caem na coluna "Sem seção", depois remove a seção.
 */
export function useExcluirSecao(projetoId: string) {
  const invalidar = useInvalidarProjeto(projetoId);
  return useMutation({
    mutationFn: async (secaoId: string) => {
      const soltar = await supabase.from("tarefas").update({ secao_id: null }).eq("secao_id", secaoId);
      if (soltar.error) throw soltar.error;
      const { error } = await supabase.from("tarefas_secoes").delete().eq("id", secaoId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success("Seção excluída. As tarefas foram para “Sem seção”.");
    },
    onError: (e: Error) => toast.error(`Não foi possível excluir a seção: ${e.message}`),
  });
}

// ————————————————————————— board —————————————————————————

export interface TarefaBoard extends Tarefa {
  criado_por: string | null;
  tipo_tarefa: "tarefa" | "marco" | "aprovacao";
}

const CAMPOS_BOARD =
  "id,titulo,descricao,status,prioridade,projeto_id,secao_id,parent_id,responsavel_id,data_inicio,data_limite,hora_limite,data_conclusao,estimativa_horas,acao_url,ordem,criado_em,criado_por,tipo_tarefa" as const;

export function chaveBoard(projetoId: string) {
  return ["tarefas", "board", projetoId];
}

export function useTarefasDoProjeto(projetoId: string | null) {
  return useQuery({
    queryKey: chaveBoard(projetoId ?? "nenhum"),
    enabled: !!projetoId,
    queryFn: async (): Promise<TarefaBoard[]> => {
      const { data, error } = await supabase
        .from("tarefas")
        .select(CAMPOS_BOARD)
        .eq("projeto_id", projetoId!)
        .order("ordem")
        .order("criado_em");
      if (error) throw error;
      return (data ?? []) as TarefaBoard[];
    },
  });
}

/** Move a tarefa de seção com update otimista: card anda na hora, volta se o banco recusar. */
export function useMoverTarefaSecao(projetoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tarefaId, secaoId }: { tarefaId: string; secaoId: string | null }) => {
      const { error } = await supabase
        .from("tarefas")
        .update({ secao_id: secaoId })
        .eq("id", tarefaId);
      if (error) throw error;
    },
    onMutate: async ({ tarefaId, secaoId }) => {
      const chave = chaveBoard(projetoId);
      await qc.cancelQueries({ queryKey: chave });
      const anterior = qc.getQueryData<TarefaBoard[]>(chave);
      if (anterior) {
        qc.setQueryData<TarefaBoard[]>(
          chave,
          anterior.map((t) => (t.id === tarefaId ? { ...t, secao_id: secaoId } : t))
        );
      }
      return { anterior };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.anterior) qc.setQueryData(chaveBoard(projetoId), ctx.anterior);
      toast.error(`A tarefa voltou para a seção anterior: ${e.message}`);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: chaveBoard(projetoId) });
      qc.invalidateQueries({ queryKey: ["tarefas", "hoje"] });
      qc.invalidateQueries({ queryKey: ["tarefas", "minhas"] });
    },
  });
}

export function useCriarTarefaNaSecao(projetoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ titulo, secaoId }: { titulo: string; secaoId: string | null }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("tarefas").insert({
        titulo,
        projeto_id: projetoId,
        secao_id: secaoId,
        criado_por: auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tarefas"] }),
    onError: (e: Error) => toast.error(`Não foi possível criar a tarefa: ${e.message}`),
  });
}
