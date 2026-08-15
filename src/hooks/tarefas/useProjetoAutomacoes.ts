import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

/** Automações do projeto (tarefas_regras). Gatilho e ações são jsonb montados por editor guiado. */

export type GatilhoTipo =
  | "tarefa_criada"
  | "secao_alterada"
  | "status_alterado"
  | "responsavel_alterado"
  | "etiqueta_adicionada"
  | "concluida";

export const GATILHO_ROTULO: Record<GatilhoTipo, string> = {
  tarefa_criada: "Quando a tarefa é criada",
  secao_alterada: "Quando muda de seção",
  status_alterado: "Quando muda de status",
  responsavel_alterado: "Quando troca de responsável",
  etiqueta_adicionada: "Quando recebe uma etiqueta",
  concluida: "Quando é concluída",
};

export type AcaoTipo =
  | "definir_responsavel"
  | "definir_status"
  | "definir_prioridade"
  | "mover_secao"
  | "adicionar_etiqueta"
  | "definir_data_limite";

export const ACAO_ROTULO: Record<AcaoTipo, string> = {
  definir_responsavel: "Definir responsável",
  definir_status: "Definir status",
  definir_prioridade: "Definir prioridade",
  mover_secao: "Mover para a seção",
  adicionar_etiqueta: "Adicionar etiqueta",
  definir_data_limite: "Definir data limite (dias a partir de hoje)",
};

export interface AcaoRegra {
  tipo: AcaoTipo;
  valor: string | null;
}

export interface GatilhoRegra {
  tipo: GatilhoTipo;
  /** valor de contexto: id da seção, status alvo, id da etiqueta… */
  valor?: string | null;
}

export interface Regra {
  id: string;
  projeto_id: string | null;
  nome: string;
  ativo: boolean;
  gatilho: GatilhoRegra;
  acoes: AcaoRegra[];
  execucoes: number;
  ultima_execucao_em: string | null;
  criado_em: string;
}

function normalizarGatilho(bruto: Json): GatilhoRegra {
  const g = (bruto ?? {}) as { tipo?: string; valor?: string | null };
  return { tipo: (g.tipo as GatilhoTipo) ?? "tarefa_criada", valor: g.valor ?? null };
}

function normalizarAcoes(bruto: Json): AcaoRegra[] {
  if (!Array.isArray(bruto)) return [];
  return (bruto as unknown as { tipo?: string; valor?: string | null }[])
    .filter((a) => !!a?.tipo)
    .map((a) => ({ tipo: a.tipo as AcaoTipo, valor: a.valor ?? null }));
}

export function useRegrasProjeto(projetoId: string | null) {
  return useQuery({
    queryKey: ["tarefas", "regras", projetoId ?? "nenhum"],
    enabled: !!projetoId,
    queryFn: async (): Promise<Regra[]> => {
      const { data, error } = await supabase
        .from("tarefas_regras")
        .select("id,projeto_id,nome,ativo,gatilho,acoes,execucoes,ultima_execucao_em,criado_em")
        .eq("projeto_id", projetoId!)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        projeto_id: r.projeto_id,
        nome: r.nome,
        ativo: r.ativo,
        execucoes: r.execucoes,
        ultima_execucao_em: r.ultima_execucao_em,
        criado_em: r.criado_em,
        gatilho: normalizarGatilho(r.gatilho),
        acoes: normalizarAcoes(r.acoes),
      }));
    },
  });
}

export interface RegraForm {
  nome: string;
  ativo: boolean;
  gatilho: GatilhoRegra;
  acoes: AcaoRegra[];
}

export function useSalvarRegra(projetoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, form }: { id?: string; form: RegraForm }) => {
      const payload = {
        nome: form.nome,
        ativo: form.ativo,
        gatilho: form.gatilho as unknown as Json,
        acoes: form.acoes as unknown as Json,
      };
      if (id) {
        const { error } = await supabase.from("tarefas_regras").update(payload).eq("id", id);
        if (error) throw error;
        return;
      }
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("tarefas_regras")
        .insert({ ...payload, projeto_id: projetoId, criado_por: auth.user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tarefas", "regras", projetoId] });
      toast.success("Automação salva");
    },
    onError: (e: Error) => toast.error(`Não foi possível salvar a automação: ${e.message}`),
  });
}

export function useAlternarRegra(projetoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("tarefas_regras").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tarefas", "regras", projetoId] }),
    onError: (e: Error) => toast.error(`Não foi possível alterar a automação: ${e.message}`),
  });
}

export function useExcluirRegra(projetoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tarefas_regras").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tarefas", "regras", projetoId] });
      toast.success("Automação excluída");
    },
    onError: (e: Error) => toast.error(`Não foi possível excluir a automação: ${e.message}`),
  });
}
