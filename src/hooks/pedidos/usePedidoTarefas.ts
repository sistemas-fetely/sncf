import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface PedidoTarefa {
  id: string;
  pedido_id: string;
  titulo: string;
  concluida: boolean;
  concluida_em: string | null;
  concluida_por: string | null;
  criada_por: string | null;
  ordem: number;
  created_at: string;
  updated_at: string;
}

export function usePedidoTarefas(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["pedido-tarefas", pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedido_tarefas")
        .select("*")
        .eq("pedido_id", pedidoId!)
        .order("concluida", { ascending: true })
        .order("ordem", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PedidoTarefa[];
    },
  });
}

export function useCriarTarefa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pedidoId, titulo }: { pedidoId: string; titulo: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("pedido_tarefas").insert({
        pedido_id: pedidoId,
        titulo,
        criada_por: userData.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pedido-tarefas", vars.pedidoId] });
    },
    onError: (e: any) => toast({ title: "Erro ao criar tarefa", description: e.message, variant: "destructive" }),
  });
}

export function useToggleTarefa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, concluida, pedidoId: _p }: { id: string; concluida: boolean; pedidoId: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("pedido_tarefas")
        .update({
          concluida,
          concluida_em: concluida ? new Date().toISOString() : null,
          concluida_por: concluida ? userData.user?.id ?? null : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pedido-tarefas", vars.pedidoId] });
    },
    onError: (e: any) => toast({ title: "Erro ao atualizar tarefa", description: e.message, variant: "destructive" }),
  });
}

export function useExcluirTarefa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pedidoId: _p }: { id: string; pedidoId: string }) => {
      const { error } = await supabase.from("pedido_tarefas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pedido-tarefas", vars.pedidoId] });
    },
    onError: (e: any) => toast({ title: "Erro ao excluir tarefa", description: e.message, variant: "destructive" }),
  });
}
