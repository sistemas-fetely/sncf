import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Tarefas vinculadas ao pedido (Casa dos Pedidos → aba Tarefas).
 * Leitura SEMPRE via vw_pedido_tarefas; criação SEMPRE via fn_criar_tarefa_pedido
 * (a RPC cuida do vínculo correto). Conclusão é UPDATE direto em tarefas.status,
 * respeitando o RLS existente da tabela.
 */

export type PedidoTarefaStatus =
  | "pendente"
  | "em_andamento"
  | "em_revisao"
  | "concluida"
  | "cancelada";

export type PedidoTarefaPrioridade = "baixa" | "media" | "alta" | "urgente";

/** Status que acendem o dot indicador na aba. */
export const STATUS_ABERTOS: PedidoTarefaStatus[] = [
  "pendente",
  "em_andamento",
  "em_revisao",
];

export interface PedidoTarefaVinculada {
  pedido_id: string;
  id_externo: string | null;
  tarefa_id: string;
  titulo: string;
  descricao: string | null;
  status: PedidoTarefaStatus;
  prioridade: PedidoTarefaPrioridade;
  data_limite: string | null;
  data_conclusao: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  criado_em: string;
}

export function usePedidoTarefasVinculadas(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["pedido-tarefas-vinculadas", pedidoId],
    enabled: !!pedidoId,
    queryFn: async (): Promise<PedidoTarefaVinculada[]> => {
      const { data, error } = await supabase
        .from("vw_pedido_tarefas")
        .select("*")
        .eq("pedido_id", pedidoId!)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PedidoTarefaVinculada[];
    },
  });
}

export interface ResponsavelOpcao {
  /** usuario_id do vínculo — é o que se salva na tarefa. */
  usuario_id: string;
  nome: string;
}

/**
 * Responsáveis possíveis: pessoas com vínculo ativo E usuario_id preenchido
 * (vinculos.status = 'ativo', vinculos.usuario_id not null, join pessoas).
 * Dedup por usuario_id — uma pessoa pode ter mais de um vínculo ativo.
 */
export function useResponsaveisTarefaPedido() {
  return useQuery({
    queryKey: ["responsaveis-tarefa-pedido"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ResponsavelOpcao[]> => {
      const { data, error } = await supabase
        .from("vinculos")
        .select("usuario_id, pessoas!vinculos_pessoa_id_fkey(nome_completo)")
        .eq("status", "ativo")
        .not("usuario_id", "is", null);
      if (error) throw error;

      const mapa = new Map<string, string>();
      for (const row of (data ?? []) as any[]) {
        const uid = row.usuario_id as string | null;
        const nome = (row.pessoas?.nome_completo as string | null) ?? null;
        if (uid && nome && !mapa.has(uid)) mapa.set(uid, nome);
      }
      return [...mapa.entries()]
        .map(([usuario_id, nome]) => ({ usuario_id, nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },
  });
}

export interface NovaTarefaPedidoInput {
  pedidoId: string;
  titulo: string;
  descricao: string;
  responsavelId: string;
  prioridade: PedidoTarefaPrioridade;
  dataLimite: string | null;
}

export function useCriarTarefaPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NovaTarefaPedidoInput) => {
      const titulo = input.titulo.trim();
      if (!titulo) throw new Error("Tarefa sem título.");
      const { error } = await supabase.rpc("fn_criar_tarefa_pedido", {
        p_pedido_id: input.pedidoId,
        p_titulo: titulo,
        p_descricao: input.descricao.trim(),
        p_responsavel_id: input.responsavelId,
        p_prioridade: input.prioridade,
        p_data_limite: input.dataLimite ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["pedido-tarefas-vinculadas", v.pedidoId] });
      toast.success("Tarefa criada e vinculada ao pedido");
    },
    onError: (e: Error) =>
      toast.error(`Não foi possível criar a tarefa: ${e.message}`),
  });
}

export function useConcluirTarefaPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tarefaId }: { tarefaId: string; pedidoId: string }) => {
      const { error } = await supabase
        .from("tarefas")
        .update({ status: "concluida" })
        .eq("id", tarefaId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["pedido-tarefas-vinculadas", v.pedidoId] });
      toast.success("Tarefa concluída");
    },
    onError: (e: Error) =>
      toast.error(`Não foi possível concluir a tarefa: ${e.message}`),
  });
}
