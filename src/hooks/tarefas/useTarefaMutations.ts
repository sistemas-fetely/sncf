import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { QuickAddResult } from "@/lib/tarefas/quickAddParser";
import type { TarefaStatus } from "./useTarefas";

/**
 * FAIL-LOUD: toda mutation aqui tem await real, throw e toast de erro.
 * Nada de fire-and-forget — erro engolido escondeu bug crítico na origem
 * deste módulo por várias rodadas.
 */

function invalidarTarefas(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["tarefas"] });
}

export interface NovaTarefaInput {
  titulo: string;
  descricao?: string | null;
  projeto_id?: string | null;
  secao_id?: string | null;
  responsavel_id?: string | null;
  prioridade?: "baixa" | "media" | "alta" | "urgente";
  data_limite?: string | null;
  hora_limite?: string | null;
  estimativa_horas?: number | null;
  /** nomes de etiqueta; as que não existirem são criadas */
  etiquetas?: string[];
}

async function resolverEtiquetas(nomes: string[]): Promise<string[]> {
  if (!nomes.length) return [];
  const { data: existentes, error: errBusca } = await supabase
    .from("tarefas_etiquetas")
    .select("id,nome")
    .in("nome", nomes);
  if (errBusca) throw errBusca;

  const porNome = new Map((existentes ?? []).map((e) => [e.nome.toLowerCase(), e.id]));
  const faltando = nomes.filter((n) => !porNome.has(n.toLowerCase()));

  if (faltando.length) {
    const { data: criadas, error: errCria } = await supabase
      .from("tarefas_etiquetas")
      .insert(faltando.map((nome) => ({ nome })))
      .select("id,nome");
    if (errCria) throw errCria;
    for (const e of criadas ?? []) porNome.set(e.nome.toLowerCase(), e.id);
  }

  return nomes.map((n) => porNome.get(n.toLowerCase())).filter((v): v is string => !!v);
}

export function useCriarTarefa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NovaTarefaInput) => {
      const titulo = input.titulo.trim();
      if (!titulo) throw new Error("Tarefa sem título.");

      const { data: sessao } = await supabase.auth.getUser();
      const uid = sessao.user?.id ?? null;

      const { data: tarefa, error } = await supabase
        .from("tarefas")
        .insert({
          titulo,
          descricao: input.descricao ?? null,
          projeto_id: input.projeto_id ?? null,
          secao_id: input.secao_id ?? null,
          responsavel_id: input.responsavel_id ?? uid,
          prioridade: input.prioridade ?? "media",
          data_limite: input.data_limite ?? null,
          hora_limite: input.hora_limite ?? null,
          estimativa_horas: input.estimativa_horas ?? null,
          criado_por: uid,
          status: "pendente",
          tipo_origem: "manual",
          tipo_tarefa: "tarefa",
          visibilidade: "publica",
        })
        .select("id")
        .single();
      if (error) throw error;

      const etiquetaIds = await resolverEtiquetas(input.etiquetas ?? []);
      if (etiquetaIds.length) {
        const { error: errTag } = await supabase
          .from("tarefas_tarefa_etiquetas")
          .insert(etiquetaIds.map((etiqueta_id) => ({ tarefa_id: tarefa.id, etiqueta_id })));
        if (errTag) throw errTag;
      }

      return tarefa.id as string;
    },
    onSuccess: () => {
      invalidarTarefas(qc);
      toast.success("Tarefa criada");
    },
    onError: (e: Error) => toast.error(`Não foi possível criar a tarefa: ${e.message}`),
  });
}

/**
 * Cria a partir do resultado do quick add. Projeto, seção e responsável vêm
 * como NOME e precisam ser resolvidos para id pelo chamador — o que não
 * resolver fica nulo e o texto já está no título, então nada se perde.
 */
export function useCriarTarefaQuickAdd() {
  const criar = useCriarTarefa();
  return {
    ...criar,
    criarDoParse: (
      r: QuickAddResult,
      ids: { projeto_id?: string | null; secao_id?: string | null; responsavel_id?: string | null }
    ) =>
      criar.mutateAsync({
        titulo: r.titulo || r.tokens.map((t) => t.texto).join(" "),
        prioridade: r.prioridade ?? "media",
        data_limite: r.dataLimite,
        hora_limite: r.horaLimite,
        etiquetas: r.etiquetas,
        ...ids,
      }),
  };
}

/** Reagendamento rápido — a ação mais repetida do dia. */
export function useReagendarTarefa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data_limite }: { id: string; data_limite: string | null }) => {
      const { error } = await supabase.from("tarefas").update({ data_limite }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidarTarefas(qc);
      toast.success("Tarefa reagendada");
    },
    onError: (e: Error) => toast.error(`Não foi possível reagendar: ${e.message}`),
  });
}

/**
 * Troca de status. NÃO seta data_conclusao — quem faz isso é trigger no banco,
 * conforme o status. Setar no front cria duas fontes de verdade.
 * `motivo` grava em motivo_estado — obrigatório nos status com exige_motivo.
 */
export function useAlterarStatusTarefa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      motivo,
    }: {
      id: string;
      status: TarefaStatus;
      motivo?: string | null;
    }) => {
      const patch: { status: TarefaStatus; motivo_estado?: string } = { status };
      if (motivo != null && motivo.trim()) patch.motivo_estado = motivo.trim();
      const { error } = await supabase.from("tarefas").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      invalidarTarefas(qc);
      if (v.status === "concluida") toast.success("Tarefa concluída");
    },
    onError: (e: Error) => toast.error(`Não foi possível alterar o status: ${e.message}`),
  });
}

