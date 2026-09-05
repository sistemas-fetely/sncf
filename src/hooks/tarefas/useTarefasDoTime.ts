import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { codigosAbertos } from "@/hooks/tarefas/useStatusTarefaDim";
import { type Tarefa } from "@/hooks/tarefas/useTarefas";

/**
 * Meu Time (F5).
 * Quem é "meu time" é decidido NO BANCO por tarefas_meu_time().
 * Ela devolve apenas os liderados diretos do usuário logado
 * (vinculos.gestor_pessoa_id), sem bypass de admin. O front não
 * reimplementa essa regra.
 */

const CAMPOS =
  "id,titulo,descricao,status,prioridade,projeto_id,secao_id,parent_id,responsavel_id,data_inicio,data_limite,hora_limite,data_conclusao,estimativa_horas,acao_url,motivo_estado,ordem,criado_em" as const;

export interface MembroTime {
  user_id: string;
  /** user_id de quem a pessoa reporta. Nulo quando o gestor não tem login. */
  gestor_user_id: string | null;
  /** distância até o usuário logado: 1 = reporta direto. */
  nivel: number;
}

export function usePessoasDoTime() {
  return useQuery({
    queryKey: ["tarefas", "time", "pessoas"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<{ membros: MembroTime[]; ids: string[] }> => {
      const { data, error } = await supabase.rpc("tarefas_meu_time");
      if (error) throw error;
      const membros = (data ?? []).map((l) => ({
        user_id: l.user_id as string,
        gestor_user_id: (l.gestor_user_id ?? null) as string | null,
        nivel: Number(l.nivel ?? 1),
      }));
      return { membros, ids: membros.map((m) => m.user_id) };
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
        .in("status", await codigosAbertos())
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
