import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Recorrências (F5).
 * Cada ciclo gera uma INSTÂNCIA NOVA de tarefa — a regra nunca "empurra" a data
 * da mesma tarefa. É decisão de auditoria: o fechamento de março fica registrado
 * como concluído em 04/04 e o de abril em 06/05.
 *
 * tarefas_rec_proxima é INCLUSIVA (devolve o próprio _de quando é ocorrência
 * válida). Para listar N ocorrências, avançamos UM DIA entre chamadas.
 */

export interface Recorrencia {
  id: string;
  titulo: string;
  descricao: string | null;
  prioridade: string;
  projeto_id: string | null;
  secao_id: string | null;
  responsavel_id: string | null;
  template_id: string | null;
  visibilidade: string;

  estimativa_horas: number | null;
  departamento_destino_id: string | null;
  frequencia: string;
  intervalo: number;
  dias_semana: number[] | null;
  dia_mes: number | null;
  mes: number | null;
  inicio_em: string;
  fim_em: string | null;
  proxima_geracao: string | null;
  antecedencia_dias: number;
  tipo_execucao: string;
  ativo: boolean;
  criado_em: string;
}

const CAMPOS =
  "id,titulo,descricao,prioridade,projeto_id,secao_id,responsavel_id,template_id,visibilidade,estimativa_horas,departamento_destino_id,frequencia,intervalo,dias_semana,dia_mes,mes,inicio_em,fim_em,proxima_geracao,antecedencia_dias,tipo_execucao,ativo,criado_em" as const;


export type NovaRecorrencia = Omit<Recorrencia, "id" | "criado_em" | "proxima_geracao">;

export function useRecorrencias() {
  return useQuery({
    queryKey: ["tarefas", "recorrencias"],
    queryFn: async (): Promise<Recorrencia[]> => {
      const { data, error } = await supabase
        .from("tarefas_recorrencias")
        .select(CAMPOS)
        .order("ativo", { ascending: false })
        .order("titulo");
      if (error) throw error;
      return (data ?? []) as Recorrencia[];
    },
  });
}

export function useSalvarRecorrencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, valores }: { id: string | null; valores: NovaRecorrencia }) => {
      if (id) {
        const { error } = await supabase
          .from("tarefas_recorrencias")
          .update({ ...valores, atualizado_em: new Date().toISOString() })
          .eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("tarefas_recorrencias")
        .insert({ ...valores, criado_por: auth.user?.id ?? null })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tarefas", "recorrencias"] });
      toast.success("Recorrência salva");
    },
    onError: (e: Error) => toast.error(`Não foi possível salvar a recorrência: ${e.message}`),
  });
}

export function useAlternarRecorrencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("tarefas_recorrencias")
        .update({ ativo, atualizado_em: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tarefas", "recorrencias"] }),
    onError: (e: Error) => toast.error(`Não foi possível mudar o estado: ${e.message}`),
  });
}

export function useExcluirRecorrencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tarefas_recorrencias").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tarefas", "recorrencias"] });
      toast.success("Recorrência excluída");
    },
    onError: (e: Error) => toast.error(`Não foi possível excluir: ${e.message}`),
  });
}

export interface ParametrosPreview {
  frequencia: string;
  intervalo: number;
  dias_semana: number[] | null;
  dia_mes: number | null;
  mes: number | null;
  inicio_em: string;
}

function maisUmDia(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Próximas 3 ocorrências. A RPC é inclusiva de propósito — respeitamos isso
 * avançando um dia depois de cada resultado, nunca "corrigindo" a função.
 */
export function usePreviewOcorrencias(p: ParametrosPreview, quantas = 3) {
  return useQuery({
    queryKey: [
      "tarefas", "rec-preview", p.frequencia, p.intervalo,
      (p.dias_semana ?? []).join(","), p.dia_mes ?? "-", p.mes ?? "-", p.inicio_em, quantas,
    ],
    enabled: !!p.frequencia && !!p.inicio_em && p.intervalo >= 1,
    queryFn: async (): Promise<string[]> => {
      const hoje = hojeISO();
      let de = p.inicio_em > hoje ? p.inicio_em : hoje;
      const saida: string[] = [];
      for (let i = 0; i < quantas; i++) {
        const { data, error } = await supabase.rpc("tarefas_rec_proxima", {
          _frequencia: p.frequencia,
          _intervalo: p.intervalo,
          _dias_semana: p.dias_semana ?? [],
          _dia_mes: p.dia_mes ?? 1,
          _mes: p.mes ?? 1,
          _inicio: p.inicio_em,
          _de: de,
        });
        if (error) throw error;
        if (!data) break;
        const proxima = String(data).slice(0, 10);
        saida.push(proxima);
        de = maisUmDia(proxima);
      }
      return saida;
    },
  });
}

/** botão "Gerar agora": esse tem feedback explícito */
export function useGerarRecorrentesAgora() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("gerar_tarefas_recorrentes");
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["tarefas"] });
      toast.success(n === 0 ? "Nada a gerar agora" : `${n} tarefa(s) gerada(s)`);
    },
    onError: (e: Error) => toast.error(`Não foi possível gerar as tarefas: ${e.message}`),
  });
}
