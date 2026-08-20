import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Fila de Processos — lê SOMENTE vw_tarefas (sobre sncf_tarefas).
 * Nada a ver com public.tarefas (agenda pessoal). Não misturar as duas.
 */

export interface TarefaFila {
  id: string;
  titulo: string;
  descricao: string | null;
  sistema_origem: string | null;
  sistema_origem_nome: string | null;
  tipo_processo: string | null;
  tipo_processo_nome: string | null;
  area_destino: string | null;
  area_nome: string | null;
  area_destino_id: string | null;
  prazo_data: string | null;
  status: string;
  prioridade: string | null;
  bloqueante: boolean | null;
  motivo_bloqueio: string | null;
  link_acao: string | null;
  responsavel_user_id: string | null;
  responsavel_role: string | null;
  accountable_user_id: string | null;
  colaborador_nome: string | null;
  esta_aberta: boolean | null;
  esta_atrasada: boolean | null;
  dias_atraso: number | null;
  dias_restantes: number | null;
  dono_inalcancavel: boolean | null;
  evidencia_texto: string | null;
  evidencia_url: string | null;
  created_at: string | null;
}

const CAMPOS =
  "id,titulo,descricao,sistema_origem,sistema_origem_nome,tipo_processo,tipo_processo_nome,area_destino,area_nome,area_destino_id,prazo_data,status,prioridade,bloqueante,motivo_bloqueio,link_acao,responsavel_user_id,responsavel_role,accountable_user_id,colaborador_nome,esta_aberta,esta_atrasada,dias_atraso,dias_restantes,dono_inalcancavel,evidencia_texto,evidencia_url,created_at" as const;

export interface FiltrosFila {
  sistema?: string | null;
  area?: string | null;
  soBloqueantes?: boolean;
  soAtrasadas?: boolean;
  mostrarEncerradas?: boolean;
}

export const KEY_FILA = ["tarefas", "fila-processos"] as const;

export function useFilaProcessos(filtros: FiltrosFila = {}) {
  const { sistema, area, soBloqueantes, soAtrasadas, mostrarEncerradas } = filtros;
  return useQuery({
    queryKey: [
      ...KEY_FILA,
      sistema ?? "-",
      area ?? "-",
      !!soBloqueantes,
      !!soAtrasadas,
      !!mostrarEncerradas,
    ],
    queryFn: async (): Promise<TarefaFila[]> => {
      let q = supabase
        .from("vw_tarefas")
        .select(CAMPOS)
        .order("bloqueante", { ascending: false, nullsFirst: false })
        .order("prazo_data", { ascending: true, nullsFirst: false });

      if (sistema) q = q.eq("sistema_origem", sistema);
      if (area) q = q.eq("area_destino", area);
      if (soBloqueantes) q = q.eq("bloqueante", true);
      if (soAtrasadas) q = q.eq("esta_atrasada", true);
      if (!mostrarEncerradas) q = q.eq("esta_aberta", true);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as TarefaFila[];
    },
  });
}

export function useConcluirTarefaFila() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      evidenciaTexto,
      evidenciaUrl,
    }: {
      id: string;
      evidenciaTexto?: string | null;
      evidenciaUrl?: string | null;
    }) => {
      const args: { p_tarefa_id: string; p_evidencia_texto?: string; p_evidencia_url?: string } = {
        p_tarefa_id: id,
      };
      if (evidenciaTexto?.trim()) args.p_evidencia_texto = evidenciaTexto.trim();
      if (evidenciaUrl?.trim()) args.p_evidencia_url = evidenciaUrl.trim();
      const { error } = await supabase.rpc("concluir_tarefa", args);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY_FILA });
      toast.success("Tarefa concluída");
    },
    onError: (e: Error) => toast.error(`Não foi possível concluir: ${e.message}`),
  });
}

export function useCancelarTarefaFila() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      const { error } = await supabase.rpc("cancelar_tarefa", {
        p_tarefa_id: id,
        p_motivo: motivo.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY_FILA });
      toast.success("Tarefa cancelada");
    },
    onError: (e: Error) => toast.error(`Não foi possível cancelar: ${e.message}`),
  });
}

export function useTransicionarTarefaFila() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, novoStatus }: { id: string; novoStatus: string }) => {
      const { error } = await supabase.rpc("transicionar_tarefa", {
        p_tarefa_id: id,
        p_novo_status: novoStatus,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY_FILA });
      toast.success("Status atualizado");
    },
    onError: (e: Error) => toast.error(`Não foi possível mudar o status: ${e.message}`),
  });
}
