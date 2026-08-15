import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ProjetoSaude } from "./useProjetosTarefas";

/** Painel do projeto: status report, bloqueios e série do burndown. */

export interface StatusReport {
  id: string;
  projeto_id: string;
  saude: ProjetoSaude;
  resumo: string | null;
  criado_por: string | null;
  criado_em: string;
}

export function useStatusReports(projetoId: string | null) {
  return useQuery({
    queryKey: ["tarefas", "status-reports", projetoId ?? "nenhum"],
    enabled: !!projetoId,
    queryFn: async (): Promise<StatusReport[]> => {
      const { data, error } = await supabase
        .from("tarefas_projeto_status")
        .select("id,projeto_id,saude,resumo,criado_por,criado_em")
        .eq("projeto_id", projetoId!)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StatusReport[];
    },
  });
}

export function usePublicarStatusReport(projetoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ saude, resumo }: { saude: ProjetoSaude; resumo: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const inserido = await supabase
        .from("tarefas_projeto_status")
        .insert({ projeto_id: projetoId, saude, resumo, criado_por: auth.user?.id ?? null });
      if (inserido.error) throw inserido.error;
      const atualizado = await supabase
        .from("tarefas_projetos")
        .update({
          saude,
          saude_atualizada_em: new Date().toISOString(),
          saude_atualizada_por: auth.user?.id ?? null,
        })
        .eq("id", projetoId);
      if (atualizado.error) throw atualizado.error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tarefas"] });
      toast.success("Status publicado");
    },
    onError: (e: Error) => toast.error(`Não foi possível publicar o status: ${e.message}`),
  });
}

export interface Bloqueio {
  tarefa_id: string;
  bloqueadores: string[];
}

/** Tarefas bloqueadas = têm dependência que ainda não foi concluída. */
export function useTarefasBloqueadas(projetoId: string | null, tarefaIds: string[]) {
  const chave = tarefaIds.slice().sort().join(",");
  return useQuery({
    queryKey: ["tarefas", "bloqueadas", projetoId ?? "nenhum", chave],
    enabled: !!projetoId && tarefaIds.length > 0,
    queryFn: async (): Promise<Bloqueio[]> => {
      const deps = await supabase
        .from("tarefas_dependencias")
        .select("tarefa_id,depende_de_id")
        .in("tarefa_id", tarefaIds);
      if (deps.error) throw deps.error;
      const linhas = deps.data ?? [];
      if (!linhas.length) return [];
      const alvoIds = [...new Set(linhas.map((l) => l.depende_de_id))];
      const alvos = await supabase.from("tarefas").select("id,titulo,status").in("id", alvoIds);
      if (alvos.error) throw alvos.error;
      const porId = new Map((alvos.data ?? []).map((t) => [t.id, t]));
      const mapa = new Map<string, string[]>();
      for (const l of linhas) {
        const alvo = porId.get(l.depende_de_id);
        if (!alvo || alvo.status === "concluida" || alvo.status === "cancelada") continue;
        mapa.set(l.tarefa_id, [...(mapa.get(l.tarefa_id) ?? []), alvo.titulo]);
      }
      return [...mapa.entries()].map(([tarefa_id, bloqueadores]) => ({ tarefa_id, bloqueadores }));
    },
  });
}

export interface PontoBurndown {
  dia: string;
  restantes: number;
}

/** Burndown simples: quantas tarefas seguiam abertas em cada dia dos últimos 30. */
export function montarBurndown(
  tarefas: { criado_em: string; data_conclusao: string | null }[],
  dias = 30
): PontoBurndown[] {
  const pontos: PontoBurndown[] = [];
  const hoje = new Date();
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(d.getDate() - i);
    d.setHours(23, 59, 59, 999);
    const restantes = tarefas.filter((t) => {
      const criada = new Date(t.criado_em) <= d;
      const concluida = t.data_conclusao ? new Date(t.data_conclusao) <= d : false;
      return criada && !concluida;
    }).length;
    pontos.push({
      dia: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
      restantes,
    });
  }
  return pontos;
}
