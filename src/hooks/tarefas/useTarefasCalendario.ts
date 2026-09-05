import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { STATUS_ABERTOS, type Tarefa } from "./useTarefas";

/**
 * Calendário (F4) — grade própria, nenhuma biblioteca de calendário.
 * O hook só entrega as tarefas com data_limite dentro da janela pedida.
 * FAIL-LOUD: throw no erro, toast e rollback no reagendamento.
 */

const CAMPOS =
  "id,titulo,descricao,status,prioridade,projeto_id,secao_id,parent_id,responsavel_id,data_inicio,data_limite,hora_limite,data_conclusao,estimativa_horas,acao_url,motivo_cancelamento,natureza,ordem,criado_em" as const;

export interface FiltroCalendario {
  /** null = todos os responsáveis */
  responsavelId: string | null;
  /** null = todos os projetos */
  projetoId: string | null;
}

function chave(inicio: string, fim: string, f: FiltroCalendario) {
  return ["tarefas", "calendario", inicio, fim, f.responsavelId ?? "todos", f.projetoId ?? "todos"];
}

export function useTarefasCalendario(inicio: string, fim: string, filtro: FiltroCalendario) {
  return useQuery({
    queryKey: chave(inicio, fim, filtro),
    queryFn: async (): Promise<Tarefa[]> => {
      let q = supabase
        .from("tarefas")
        .select(CAMPOS)
        .in("status", STATUS_ABERTOS)
        .not("data_limite", "is", null)
        .gte("data_limite", inicio)
        .lte("data_limite", fim)
        .order("hora_limite", { ascending: true, nullsFirst: true })
        .order("ordem", { ascending: true });
      if (filtro.responsavelId) q = q.eq("responsavel_id", filtro.responsavelId);
      if (filtro.projetoId) q = q.eq("projeto_id", filtro.projetoId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Tarefa[];
    },
  });
}

/** arrastar entre dias: UPDATE data_limite, com update otimista e rollback */
export function useReagendarNoCalendario(inicio: string, fim: string, filtro: FiltroCalendario) {
  const qc = useQueryClient();
  const k = chave(inicio, fim, filtro);
  return useMutation({
    mutationFn: async ({ tarefaId, data }: { tarefaId: string; data: string }) => {
      const { error } = await supabase.from("tarefas").update({ data_limite: data }).eq("id", tarefaId);
      if (error) throw error;
    },
    onMutate: async ({ tarefaId, data }) => {
      await qc.cancelQueries({ queryKey: k });
      const anterior = qc.getQueryData<Tarefa[]>(k);
      if (anterior) {
        qc.setQueryData<Tarefa[]>(
          k,
          anterior.map((t) => (t.id === tarefaId ? { ...t, data_limite: data } : t))
        );
      }
      return { anterior };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.anterior) qc.setQueryData(k, ctx.anterior);
      toast.error(`A tarefa voltou para a data anterior: ${e.message}`);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["tarefas"] });
    },
  });
}
