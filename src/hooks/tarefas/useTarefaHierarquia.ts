import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CHAVE_BLOQUEIO } from "./useTarefaBloqueio";

/**
 * Promover subtarefa a tarefa principal e o caminho inverso (rebaixar).
 * As duas RPCs já existem no banco e levantam mensagens legíveis em português —
 * FAIL-LOUD: await real, throw no erro, toast com a mensagem crua do banco.
 */

function invalidarHierarquia(qc: ReturnType<typeof useQueryClient>) {
  // ["tarefas"] cobre board, subtarefas, detalhe, contadores e listas
  qc.invalidateQueries({ queryKey: ["tarefas"] });
  qc.invalidateQueries({ queryKey: CHAVE_BLOQUEIO });
  qc.invalidateQueries({ queryKey: ["tarefas", "dependencias-detalhe"] });
}

export interface PromoverInput {
  tarefaId: string;
  projetoId: string | null;
  secaoId: string | null;
  manterVinculo: boolean;
}

export function usePromoverTarefa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tarefaId, projetoId, secaoId, manterVinculo }: PromoverInput) => {
      const { error } = await supabase.rpc("fn_tarefa_promover", {
        p_tarefa_id: tarefaId,
        p_projeto_id: projetoId ?? undefined,
        p_secao_id: secaoId ?? undefined,
        p_manter_vinculo: manterVinculo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidarHierarquia(qc);
      toast.success("Subtarefa promovida a tarefa principal");
    },
    onError: (e: Error) => toast.error(`Não foi possível promover: ${e.message}`),
  });
}

export function useRebaixarTarefa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tarefaId, parentId }: { tarefaId: string; parentId: string }) => {
      const { error } = await supabase.rpc("fn_tarefa_rebaixar", {
        p_tarefa_id: tarefaId,
        p_parent_id: parentId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidarHierarquia(qc);
      toast.success("Tarefa transformada em subtarefa");
    },
    onError: (e: Error) => toast.error(`Não foi possível rebaixar: ${e.message}`),
  });
}

export interface TarefaMaeCandidata {
  id: string;
  titulo: string;
  status: string;
}

/**
 * Candidatas a mãe: tarefas principais do MESMO projeto, sem a própria tarefa.
 * Não existe subtarefa de subtarefa, então quem já tem parent_id fica fora.
 */
export function useTarefasPrincipaisDoProjeto(projetoId: string | null, excluirId: string | null) {
  return useQuery({
    queryKey: ["tarefas", "principais-projeto", projetoId ?? "nenhum", excluirId ?? "nenhuma"],
    enabled: !!projetoId && !!excluirId,
    queryFn: async (): Promise<TarefaMaeCandidata[]> => {
      const { data, error } = await supabase
        .from("tarefas")
        .select("id,titulo,status")
        .eq("projeto_id", projetoId!)
        .is("parent_id", null)
        .neq("id", excluirId!)
        .order("criado_em", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as TarefaMaeCandidata[];
    },
  });
}
