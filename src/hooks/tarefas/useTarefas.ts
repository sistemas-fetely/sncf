import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TarefaStatus = "pendente" | "em_andamento" | "em_revisao" | "concluida" | "cancelada";
export type TarefaPrioridade = "baixa" | "media" | "alta" | "urgente";

export interface Tarefa {
  id: string;
  titulo: string;
  descricao: string | null;
  status: TarefaStatus;
  prioridade: TarefaPrioridade;
  projeto_id: string | null;
  secao_id: string | null;
  parent_id: string | null;
  responsavel_id: string | null;
  data_inicio: string | null;
  data_limite: string | null;
  hora_limite: string | null;
  data_conclusao: string | null;
  estimativa_horas: number | null;
  acao_url: string | null;
  motivo_cancelamento: string | null;
  /**
   * Regra derivada na view: raiz (sem mãe) ou subtarefa com responsável
   * diferente do da mãe. Ausente nos selects feitos na tabela `tarefas`.
   */
  trabalho_independente?: boolean | null;
  /** título da tarefa-mãe, quando a linha é subtarefa (vem da view) */
  mae_titulo?: string | null;
  mae_id?: string | null;
  /** derivados da view: contêiner = tem filhas não-canceladas */
  eh_container?: boolean | null;
  filhas_total?: number | null;
  filhas_concluidas?: number | null;
  ordem: number;
  criado_em: string;
}

/** status que ainda pedem ação — cancelada e concluida saem da lista */
export const STATUS_ABERTOS: TarefaStatus[] = ["pendente", "em_andamento", "em_revisao"];

const CAMPOS =
  "id,titulo,descricao,status,prioridade,projeto_id,secao_id,parent_id,responsavel_id,data_inicio,data_limite,hora_limite,data_conclusao,estimativa_horas,acao_url,motivo_cancelamento,ordem,criado_em" as const;


function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function somaDiasISO(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface HojeAgrupado {
  atrasadas: Tarefa[];
  hoje: Tarefa[];
}

/**
 * Aba Hoje: vence hoje + TODAS as atrasadas.
 * Atrasado não pode ficar escondido numa aba que ninguém abre.
 */
export function useTarefasHoje(userId: string | undefined) {
  return useQuery({
    queryKey: ["tarefas", "hoje", userId],
    enabled: !!userId,
    queryFn: async (): Promise<HojeAgrupado> => {
      const hoje = hojeISO();
      const { data, error } = await supabase
        .from("tarefas")
        .select(CAMPOS)
        .eq("responsavel_id", userId!)
        .in("status", STATUS_ABERTOS)
        .not("data_limite", "is", null)
        .lte("data_limite", hoje)
        .order("data_limite", { ascending: true })
        .order("prioridade", { ascending: true })
        .order("ordem", { ascending: true });
      if (error) throw error;
      const linhas = (data ?? []) as Tarefa[];
      return {
        atrasadas: linhas.filter((t) => t.data_limite! < hoje),
        hoje: linhas.filter((t) => t.data_limite === hoje),
      };
    },
  });
}

export interface DiaAgrupado {
  /** YYYY-MM-DD */
  data: string;
  tarefas: Tarefa[];
}

/**
 * Próximos 7 dias, agrupado por dia — INCLUINDO dias vazios.
 * Dia vazio é informação: mostra folga.
 */
export function useTarefasProximos7(userId: string | undefined) {
  return useQuery({
    queryKey: ["tarefas", "proximos7", userId],
    enabled: !!userId,
    queryFn: async (): Promise<DiaAgrupado[]> => {
      const de = somaDiasISO(1);
      const ate = somaDiasISO(7);
      const { data, error } = await supabase
        .from("tarefas")
        .select(CAMPOS)
        .eq("responsavel_id", userId!)
        .in("status", STATUS_ABERTOS)
        .gte("data_limite", de)
        .lte("data_limite", ate)
        .order("data_limite", { ascending: true })
        .order("ordem", { ascending: true });
      if (error) throw error;
      const linhas = (data ?? []) as Tarefa[];

      const dias: DiaAgrupado[] = [];
      for (let i = 1; i <= 7; i++) {
        const dia = somaDiasISO(i);
        dias.push({ data: dia, tarefas: linhas.filter((t) => t.data_limite === dia) });
      }
      return dias;
    },
  });
}

/** Caixa de entrada: capturado e ainda não agendado. */
export function useTarefasSemData(userId: string | undefined) {
  return useQuery({
    queryKey: ["tarefas", "semData", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Tarefa[]> => {
      const { data, error } = await supabase
        .from("tarefas")
        .select(CAMPOS)
        .eq("responsavel_id", userId!)
        .in("status", STATUS_ABERTOS)
        .is("data_limite", null)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Tarefa[];
    },
  });
}

/** Concluídas nos últimos 30 dias, agrupadas por dia de conclusão. */
export function useTarefasConcluidas(userId: string | undefined) {
  return useQuery({
    queryKey: ["tarefas", "concluidas", userId],
    enabled: !!userId,
    queryFn: async (): Promise<DiaAgrupado[]> => {
      const de = new Date();
      de.setDate(de.getDate() - 30);
      const { data, error } = await supabase
        .from("tarefas")
        .select(CAMPOS)
        .eq("responsavel_id", userId!)
        .eq("status", "concluida")
        .gte("data_conclusao", de.toISOString())
        .order("data_conclusao", { ascending: false });
      if (error) throw error;
      const linhas = (data ?? []) as Tarefa[];

      const mapa = new Map<string, Tarefa[]>();
      for (const t of linhas) {
        const dia = (t.data_conclusao ?? "").slice(0, 10);
        if (!dia) continue;
        if (!mapa.has(dia)) mapa.set(dia, []);
        mapa.get(dia)!.push(t);
      }
      return Array.from(mapa.entries())
        .map(([data, tarefas]) => ({ data, tarefas }))
        .sort((a, b) => (a.data < b.data ? 1 : -1));
    },
  });
}

/** Contadores para os badges das abas. */
export function useTarefasContadores(userId: string | undefined) {
  return useQuery({
    queryKey: ["tarefas", "contadores", userId],
    enabled: !!userId,
    queryFn: async () => {
      const hoje = hojeISO();
      const [ate, sem] = await Promise.all([
        // Sem dimensão de natureza: conta tudo em aberto do responsável
        // (contêiner entra junto — diferença aceita por ora).
        supabase
          .from("tarefas")
          .select("id", { count: "exact", head: true })
          .eq("responsavel_id", userId!)
          .in("status", STATUS_ABERTOS)
          .lte("data_limite", hoje),
        supabase
          .from("tarefas")
          .select("id", { count: "exact", head: true })
          .eq("responsavel_id", userId!)
          .in("status", STATUS_ABERTOS)
          .is("data_limite", null),
      ]);
      if (ate.error) throw ate.error;
      if (sem.error) throw sem.error;
      return { hoje: ate.count ?? 0, semData: sem.count ?? 0 };
    },
  });
}
