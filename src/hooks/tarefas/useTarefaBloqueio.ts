import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { chaveDetalhe } from "./useTarefaDetalhe";

/**
 * Bloqueio entre tarefas. Leitura nas views `vw_tarefa_bloqueio` e
 * `vw_tarefa_dependencia_detalhe`; escrita em `tarefas_dependencias`.
 * FAIL-LOUD: erro do banco sobe, é traduzido e vira toast.
 */

export interface TarefaBloqueio {
  tarefa_id: string;
  bloqueadores_abertos: number;
  bloqueadores_total: number;
  bloqueada: boolean;
  travando_outras: number;
}

export const CHAVE_BLOQUEIO = ["tarefas", "bloqueio"] as const;

/**
 * Mapa de bloqueio das tarefas que estão de fato bloqueadas. Uma consulta só,
 * compartilhada por todas as linhas/cards da tela — nada de query por item.
 */
export function useTarefasBloqueadas() {
  return useQuery({
    queryKey: [...CHAVE_BLOQUEIO, "abertas"],
    queryFn: async (): Promise<Map<string, TarefaBloqueio>> => {
      const { data, error } = await supabase
        .from("vw_tarefa_bloqueio")
        .select("tarefa_id,bloqueadores_abertos,bloqueadores_total,bloqueada,travando_outras")
        .eq("bloqueada", true);
      if (error) throw error;
      const mapa = new Map<string, TarefaBloqueio>();
      for (const l of (data ?? []) as TarefaBloqueio[]) mapa.set(l.tarefa_id, l);
      return mapa;
    },
    staleTime: 30_000,
  });
}

/** Bloqueio de UMA tarefa (detalhe): traz também quantas ela está travando. */
export function useBloqueioTarefa(tarefaId: string | null) {
  return useQuery({
    queryKey: [...CHAVE_BLOQUEIO, "uma", tarefaId],
    enabled: !!tarefaId,
    queryFn: async (): Promise<TarefaBloqueio> => {
      const { data, error } = await supabase
        .from("vw_tarefa_bloqueio")
        .select("tarefa_id,bloqueadores_abertos,bloqueadores_total,bloqueada,travando_outras")
        .eq("tarefa_id", tarefaId!)
        .maybeSingle();
      if (error) throw error;
      return (
        (data as TarefaBloqueio | null) ?? {
          tarefa_id: tarefaId!,
          bloqueadores_abertos: 0,
          bloqueadores_total: 0,
          bloqueada: false,
          travando_outras: 0,
        }
      );
    },
  });
}

export interface DependenciaDetalhe {
  id: string;
  tarefa_id: string;
  depende_de_id: string;
  bloqueador_titulo: string | null;
  bloqueador_status_nome: string | null;
  bloqueador_resolvido: boolean | null;
  bloqueador_responsavel_id: string | null;
  bloqueada_titulo: string | null;
  bloqueada_status_nome: string | null;
  bloqueada_resolvida: boolean | null;
  bloqueada_responsavel_id: string | null;
}

const COLS_DETALHE =
  "id,tarefa_id,depende_de_id,bloqueador_titulo,bloqueador_status_nome,bloqueador_resolvido,bloqueador_responsavel_id,bloqueada_titulo,bloqueada_status_nome,bloqueada_resolvida,bloqueada_responsavel_id" as const;

/** Os dois lados: quem trava esta tarefa e quem esta tarefa está travando. */
export function useDependenciasDetalhe(tarefaId: string | null) {
  return useQuery({
    queryKey: ["tarefas", "dependencias-detalhe", tarefaId],
    enabled: !!tarefaId,
    queryFn: async () => {
      const [dependeDe, travando] = await Promise.all([
        supabase.from("vw_tarefa_dependencia_detalhe").select(COLS_DETALHE).eq("tarefa_id", tarefaId!),
        supabase.from("vw_tarefa_dependencia_detalhe").select(COLS_DETALHE).eq("depende_de_id", tarefaId!),
      ]);
      if (dependeDe.error) throw dependeDe.error;
      if (travando.error) throw travando.error;
      return {
        dependeDe: (dependeDe.data ?? []) as DependenciaDetalhe[],
        travando: (travando.data ?? []) as DependenciaDetalhe[],
      };
    },
  });
}

/** Traduz as três recusas do banco (ciclo, duplicada, ela mesma) para gente. */
export function mensagemErroDependencia(e: unknown): string {
  const err = e as { message?: string; code?: string } | null;
  const bruta = (err?.message ?? "").toLowerCase();
  const codigo = err?.code ?? "";

  if (bruta.includes("circular") || bruta.includes("ciclo") || bruta.includes("cycle")) {
    return "Essa dependência criaria um ciclo: a outra tarefa já depende desta, direta ou indiretamente.";
  }
  if (codigo === "23505" || bruta.includes("duplicate") || bruta.includes("unique")) {
    return "Essa dependência já existe.";
  }
  if (codigo === "23514" || bruta.includes("check")) {
    return "Uma tarefa não pode depender de si mesma.";
  }
  if (codigo === "23503") return "A tarefa escolhida não existe mais.";
  return err?.message || "Erro desconhecido ao gravar a dependência.";
}

export function useMutarDependenciaTarefa(tarefaId: string) {
  const qc = useQueryClient();
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["tarefas"] });
    qc.invalidateQueries({ queryKey: CHAVE_BLOQUEIO });
    qc.invalidateQueries({ queryKey: ["tarefas", "dependencias-detalhe"] });
    qc.invalidateQueries({ queryKey: ["tarefas", "dependencias", tarefaId] });
    qc.invalidateQueries({ queryKey: chaveDetalhe(tarefaId) });
  };

  const adicionar = useMutation({
    mutationFn: async (dependeDeId: string) => {
      if (dependeDeId === tarefaId) throw new Error("Uma tarefa não pode depender de si mesma.");
      const { data: sessao } = await supabase.auth.getUser();
      const { error } = await supabase.from("tarefas_dependencias").insert({
        tarefa_id: tarefaId,
        depende_de_id: dependeDeId,
        criado_por: sessao.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success("Dependência criada");
    },
    onError: (e) => toast.error(mensagemErroDependencia(e)),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tarefas_dependencias").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success("Dependência removida");
    },
    onError: (e) => toast.error(`Não foi possível remover a dependência: ${mensagemErroDependencia(e)}`),
  });

  return { adicionar, remover };
}

export interface TarefaParaDependencia {
  id: string;
  titulo: string;
  status: string;
}

/** Busca por título para escolher a dependência. Nunca oferece a própria tarefa. */
export function useBuscarTarefasParaDependencia(termo: string, excluirId: string) {
  const busca = termo.trim();
  return useQuery({
    queryKey: ["tarefas", "busca-dependencia", busca, excluirId],
    queryFn: async (): Promise<TarefaParaDependencia[]> => {
      let q = supabase
        .from("tarefas")
        .select("id,titulo,status")
        .neq("id", excluirId)
        .order("criado_em", { ascending: false })
        .limit(50);
      if (busca.length >= 2) q = q.ilike("titulo", `%${busca}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as TarefaParaDependencia[];
    },
  });
}
