import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TarefaDoPedido {
  pedido_id: string | null;
  tarefa_id: string;
  titulo: string;
  status: string;
  status_nome: string | null;
  e_terminal: boolean;
  prioridade: string;
  data_limite: string | null;
  responsavel_id: string | null;
  tipo_origem: string | null;
  projeto_id: string | null;
  atrasada: boolean;
}

export function useTarefasDoPedido(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["tarefas-do-pedido", pedidoId],
    enabled: !!pedidoId,
    queryFn: async (): Promise<TarefaDoPedido[]> => {
      const { data, error } = await supabase
        .from("vw_tarefa_do_pedido")
        .select("*")
        .eq("pedido_id", pedidoId!)
        .order("data_limite", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[]).map((row) => ({
        pedido_id: row.pedido_id as string | null,
        tarefa_id: (row.tarefa_id as string) ?? "",
        titulo: (row.titulo as string) ?? "(sem título)",
        status: (row.status as string) ?? "",
        status_nome: row.status_nome as string | null,
        e_terminal: !!row.e_terminal,
        prioridade: (row.prioridade as string) ?? "media",
        data_limite: row.data_limite as string | null,
        responsavel_id: row.responsavel_id as string | null,
        tipo_origem: row.tipo_origem as string | null,
        projeto_id: row.projeto_id as string | null,
        atrasada: !!row.atrasada,
      }));
    },
  });
}
