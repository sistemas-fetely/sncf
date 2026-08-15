import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Carga de trabalho (F4).
 * A visibilidade de quem aparece é decidida NO BANCO por tarefas_carga_semanal.
 * O front não refaz esse filtro e não tenta adivinhar quem é gestor.
 */

export interface CargaSemana {
  user_id: string;
  nome: string;
  departamento_id: string | null;
  horas_semana: number;
  semana_inicio: string;
  horas: number;
  sem_estimativa: number;
}

export function useCargaSemanal(inicio: string, semanas = 6) {
  return useQuery({
    queryKey: ["tarefas", "carga-semanal", inicio, semanas],
    queryFn: async (): Promise<CargaSemana[]> => {
      const { data, error } = await supabase.rpc("tarefas_carga_semanal", {
        _inicio: inicio,
        _semanas: semanas,
      });
      if (error) throw error;
      return (data ?? []) as CargaSemana[];
    },
  });
}

export interface CargaDetalheTarefa {
  id: string;
  titulo: string;
  status: string;
  prioridade: string;
  data_limite: string | null;
  hora_limite: string | null;
  estimativa_horas: number | null;
  projeto_id: string | null;
  tipo_tarefa: string | null;
}

export function useCargaDetalhe(userId: string | null, inicio: string | null, fim: string | null) {
  return useQuery({
    queryKey: ["tarefas", "carga-detalhe", userId ?? "-", inicio ?? "-", fim ?? "-"],
    enabled: !!userId && !!inicio && !!fim,
    queryFn: async (): Promise<CargaDetalheTarefa[]> => {
      const { data, error } = await supabase.rpc("tarefas_carga_detalhe", {
        _user_id: userId!,
        _inicio: inicio!,
        _fim: fim!,
      });
      if (error) throw error;
      return (data ?? []) as CargaDetalheTarefa[];
    },
  });
}

/** só quem tem tarefas.aprovar edita capacidade */
export function usePodeEditarCapacidade() {
  return useQuery({
    queryKey: ["tarefas", "pode-editar-capacidade"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<boolean> => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return false;
      const { data, error } = await supabase.rpc("has_module_permission", {
        _user_id: uid,
        _modulo: "tarefas",
        _acao: "aprovar",
      });
      if (error) throw error;
      return !!data;
    },
  });
}

export function useSalvarCapacidade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, horas }: { userId: string; horas: number }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("tarefas_capacidade").upsert(
        {
          user_id: userId,
          horas_semana: horas,
          atualizado_em: new Date().toISOString(),
          atualizado_por: auth.user?.id ?? null,
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tarefas", "carga-semanal"] });
      toast.success("Capacidade atualizada");
    },
    onError: (e: Error) => toast.error(`Não foi possível salvar a capacidade: ${e.message}`),
  });
}

export type TomCarga = "verde" | "ambar" | "vermelho";

/** até 80% verde, 80 a 100% âmbar, acima de 100% vermelho */
export function tomDaCarga(horas: number, capacidade: number): TomCarga {
  if (!capacidade || capacidade <= 0) return horas > 0 ? "vermelho" : "verde";
  const pct = (horas / capacidade) * 100;
  if (pct > 100) return "vermelho";
  if (pct >= 80) return "ambar";
  return "verde";
}

export const CLASSE_TOM: Record<TomCarga, string> = {
  verde: "bg-success/10 text-success border-success/30",
  ambar: "bg-warning/10 text-warning border-warning/30",
  vermelho: "bg-destructive/10 text-destructive border-destructive/30",
};
