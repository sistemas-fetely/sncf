import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STATUS_ABERTOS, type Tarefa } from "@/hooks/tarefas/useTarefas";

/**
 * Meu Time (F5).
 * Quem é "meu time" é decidido NO BANCO por tarefas_carga_pessoas_visiveis().
 * O front não reimplementa a regra de gestor e não consulta vinculos.
 * É a mesma fonte usada pela tela de Carga — uma única definição de time.
 */

const CAMPOS =
  "id,titulo,descricao,status,prioridade,projeto_id,secao_id,parent_id,responsavel_id,data_inicio,data_limite,hora_limite,data_conclusao,estimativa_horas,acao_url,ordem,criado_em" as const;

export function usePessoasDoTime() {
  return useQuery({
    queryKey: ["tarefas", "time", "pessoas-visiveis"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc("tarefas_carga_pessoas_visiveis");
      if (error) throw error;
      return (data ?? []).map((l) => l.user_id);
    },
  });
}

/** Tarefas em aberto do time inteiro. */
export function useTarefasAbertasDoTime(userIds: string[] | undefined) {
  return useQuery({
    queryKey: ["tarefas", "time", "abertas", (userIds ?? []).join(",")],
    enabled: !!userIds && userIds.length > 0,
    queryFn: async (): Promise<Tarefa[]> => {
      const { data, error } = await supabase
        .from("tarefas")
        .select(CAMPOS)
        .in("responsavel_id", userIds!)
        .in("status", STATUS_ABERTOS)
        .order("data_limite", { ascending: true, nullsFirst: false })
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Tarefa[];
    },
  });
}

/** Entregas do time nos últimos 7 dias — consulta separada, só para a aba Entregues. */
export function useTarefasEntreguesDoTime(userIds: string[] | undefined) {
  return useQuery({
    queryKey: ["tarefas", "time", "entregues7", (userIds ?? []).join(",")],
    enabled: !!userIds && userIds.length > 0,
    queryFn: async (): Promise<Tarefa[]> => {
      const de = new Date();
      de.setDate(de.getDate() - 7);
      const { data, error } = await supabase
        .from("tarefas")
        .select(CAMPOS)
        .in("responsavel_id", userIds!)
        .eq("status", "concluida")
        .gte("data_conclusao", de.toISOString())
        .order("data_conclusao", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Tarefa[];
    },
  });
}
