import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Tarefa, TarefaStatus, TarefaPrioridade } from "./useTarefas";

/**
 * Detalhe da tarefa — leitura e escrita campo a campo.
 * FAIL-LOUD: await real, throw no erro, toast de erro em toda mutation.
 */

const CAMPOS_DETALHE =
  "id,titulo,descricao,status,prioridade,projeto_id,secao_id,parent_id,responsavel_id,data_inicio,data_limite,hora_limite,data_conclusao,estimativa_horas,modulo_origem,entidade_origem_id,acao_url,motivo_cancelamento,natureza,ordem,criado_em,criado_por,visibilidade,tipo_tarefa,aprovacao_status,aprovacao_comentario,aprovacao_em,aprovacao_por" as const;

export interface TarefaDetalhe extends Tarefa {
  modulo_origem: string | null;
  entidade_origem_id: string | null;
  criado_por: string | null;
  visibilidade: "publica" | "privada";
  tipo_tarefa: "tarefa" | "marco" | "aprovacao";
  aprovacao_status: string | null;
  aprovacao_comentario: string | null;
  aprovacao_em: string | null;
  aprovacao_por: string | null;
}

export function chaveDetalhe(id: string) {
  return ["tarefas", "detalhe", id];
}

async function uidAtual(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function useInvalidar(tarefaId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["tarefas"] });
    qc.invalidateQueries({ queryKey: chaveDetalhe(tarefaId) });
  };
}

export function useTarefaDetalhe(id: string | null) {
  return useQuery({
    queryKey: chaveDetalhe(id ?? "nenhuma"),
    enabled: !!id,
    queryFn: async (): Promise<TarefaDetalhe> => {
      const { data, error } = await supabase
        .from("tarefas")
        .select(CAMPOS_DETALHE)
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as TarefaDetalhe;
    },
  });
}

export interface CamposEditaveis {
  titulo?: string;
  descricao?: string | null;
  status?: TarefaStatus;
  prioridade?: TarefaPrioridade;
  responsavel_id?: string | null;
  projeto_id?: string | null;
  secao_id?: string | null;
  data_inicio?: string | null;
  data_limite?: string | null;
  hora_limite?: string | null;
  estimativa_horas?: number | null;
  natureza?: string;
}

/** Salva um (ou poucos) campos da tarefa. Sem botão global de salvar. */
export function useSalvarCampoTarefa(tarefaId: string) {
  const invalidar = useInvalidar(tarefaId);
  return useMutation({
    mutationFn: async (patch: CamposEditaveis) => {
      const { error } = await supabase.from("tarefas").update(patch).eq("id", tarefaId);
      if (error) throw error;
    },
    onSuccess: () => invalidar(),
    onError: (e: Error) => toast.error(`Não foi possível salvar: ${e.message}`),
  });
}

export function useDecidirAprovacao(tarefaId: string) {
  const invalidar = useInvalidar(tarefaId);
  return useMutation({
    mutationFn: async ({ decisao, comentario }: { decisao: string; comentario?: string | null }) => {
      const { error } = await supabase.rpc("tarefa_decidir_aprovacao", {
        _tarefa_id: tarefaId,
        _decisao: decisao,
        _comentario: comentario ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success("Decisão registrada");
    },
    onError: (e: Error) => toast.error(`Não foi possível decidir: ${e.message}`),
  });
}

/* ---------------------------------------------------------------- RACI ---- */

export type Papel = "r" | "a" | "c" | "i";

export interface PapelLinha {
  tarefa_id: string;
  user_id: string;
  papel: Papel;
}

export function usePapeisTarefa(tarefaId: string | null) {
  return useQuery({
    queryKey: ["tarefas", "papeis", tarefaId],
    enabled: !!tarefaId,
    queryFn: async (): Promise<PapelLinha[]> => {
      const { data, error } = await supabase
        .from("tarefas_papeis")
        .select("tarefa_id,user_id,papel")
        .eq("tarefa_id", tarefaId!);
      if (error) throw error;
      return (data ?? []) as PapelLinha[];
    },
  });
}

/**
 * Escrita de papéis. O R nunca é escrito aqui — quem manda no R é
 * tarefas.responsavel_id, e o trigger do banco espelha em tarefas_papeis.
 */
export function useMutarPapel(tarefaId: string) {
  const qc = useQueryClient();
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["tarefas"] });
    qc.invalidateQueries({ queryKey: chaveDetalhe(tarefaId) });
    qc.invalidateQueries({ queryKey: ["tarefas", "papeis", tarefaId] });
  };

  const adicionar = useMutation({
    mutationFn: async ({ userId, papel }: { userId: string; papel: Exclude<Papel, "r"> }) => {
      const criado_por = await uidAtual();
      if (papel === "a") {
        const { error: errLimpa } = await supabase
          .from("tarefas_papeis")
          .delete()
          .eq("tarefa_id", tarefaId)
          .eq("papel", "a");
        if (errLimpa) throw errLimpa;
      }
      const { error } = await supabase
        .from("tarefas_papeis")
        .upsert({ tarefa_id: tarefaId, user_id: userId, papel, criado_por });
      if (error) throw error;
    },
    onSuccess: () => invalidar(),
    onError: (e: Error) => toast.error(`Não foi possível salvar o papel: ${e.message}`),
  });

  const remover = useMutation({
    mutationFn: async ({ userId, papel }: { userId: string; papel: Exclude<Papel, "r"> }) => {
      const { error } = await supabase
        .from("tarefas_papeis")
        .delete()
        .eq("tarefa_id", tarefaId)
        .eq("user_id", userId)
        .eq("papel", papel);
      if (error) throw error;
    },
    onSuccess: () => invalidar(),
    onError: (e: Error) => toast.error(`Não foi possível remover o papel: ${e.message}`),
  });

  return { adicionar, remover };
}

/* ---------------------------------------------------------- subtarefas ---- */

export function useSubtarefas(tarefaId: string | null) {
  return useQuery({
    queryKey: ["tarefas", "subtarefas", tarefaId],
    enabled: !!tarefaId,
    queryFn: async (): Promise<Tarefa[]> => {
      const { data, error } = await supabase
        .from("tarefas")
        .select(
          "id,titulo,descricao,status,prioridade,projeto_id,secao_id,parent_id,responsavel_id,data_inicio,data_limite,hora_limite,data_conclusao,estimativa_horas,acao_url,motivo_cancelamento,ordem,criado_em",
        )
        .eq("parent_id", tarefaId!)
        .order("ordem", { ascending: true })
        .order("criado_em", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Tarefa[];
    },
  });
}

export function useCriarSubtarefa(mae: TarefaDetalhe | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (titulo: string) => {
      if (!mae) throw new Error("Tarefa mãe desconhecida.");
      const t = titulo.trim();
      if (!t) throw new Error("Subtarefa sem título.");
      const uid = await uidAtual();
      const { error } = await supabase.from("tarefas").insert({
        titulo: t,
        parent_id: mae.id,
        projeto_id: mae.projeto_id,
        secao_id: mae.secao_id,
        responsavel_id: mae.responsavel_id,
        visibilidade: mae.visibilidade,
        prioridade: mae.prioridade,
        status: "pendente",
        criado_por: uid,
        tipo_origem: "manual",
        tipo_tarefa: "tarefa",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tarefas"] });
      toast.success("Subtarefa criada");
    },
    onError: (e: Error) => toast.error(`Não foi possível criar a subtarefa: ${e.message}`),
  });
}

/* ----------------------------------------------------------- etiquetas ---- */

export function useEtiquetasDaTarefa(tarefaId: string | null) {
  return useQuery({
    queryKey: ["tarefas", "etiquetas-tarefa", tarefaId],
    enabled: !!tarefaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefas_tarefa_etiquetas")
        .select("etiqueta_id, tarefas_etiquetas(id,nome,cor)")
        .eq("tarefa_id", tarefaId!);
      if (error) throw error;
      return (data ?? [])
        .map((l) => l.tarefas_etiquetas)
        .filter((e): e is { id: string; nome: string; cor: string } => !!e);
    },
  });
}

export function useMutarEtiquetasTarefa(tarefaId: string) {
  const qc = useQueryClient();
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["tarefas"] });
    qc.invalidateQueries({ queryKey: ["tarefas", "etiquetas-tarefa", tarefaId] });
  };

  const vincular = useMutation({
    mutationFn: async (nome: string) => {
      const alvo = nome.trim();
      if (!alvo) throw new Error("Etiqueta sem nome.");
      const { data: existentes, error: errBusca } = await supabase
        .from("tarefas_etiquetas")
        .select("id,nome")
        .ilike("nome", alvo);
      if (errBusca) throw errBusca;

      let id = existentes?.[0]?.id;
      if (!id) {
        const { data: criada, error: errCria } = await supabase
          .from("tarefas_etiquetas")
          .insert({ nome: alvo })
          .select("id")
          .single();
        if (errCria) throw errCria;
        id = criada.id;
      }
      const { error } = await supabase
        .from("tarefas_tarefa_etiquetas")
        .upsert({ tarefa_id: tarefaId, etiqueta_id: id });
      if (error) throw error;
    },
    onSuccess: () => invalidar(),
    onError: (e: Error) => toast.error(`Não foi possível aplicar a etiqueta: ${e.message}`),
  });

  const desvincular = useMutation({
    mutationFn: async (etiquetaId: string) => {
      const { error } = await supabase
        .from("tarefas_tarefa_etiquetas")
        .delete()
        .eq("tarefa_id", tarefaId)
        .eq("etiqueta_id", etiquetaId);
      if (error) throw error;
    },
    onSuccess: () => invalidar(),
    onError: (e: Error) => toast.error(`Não foi possível remover a etiqueta: ${e.message}`),
  });

  return { vincular, desvincular };
}

/* ------------------------------------------- campos personalizados -------- */

export type TipoCampo =
  | "texto" | "numero" | "moeda" | "data" | "selecao" | "multi_selecao" | "pessoa" | "checkbox";

export interface CampoPersonalizado {
  campo_id: string;
  nome: string;
  tipo: TipoCampo;
  opcoes: unknown;
  obrigatorio: boolean;
  ordem: number;
}

export function useCamposPersonalizados(projetoId: string | null | undefined) {
  return useQuery({
    queryKey: ["tarefas", "campos-projeto", projetoId ?? "nenhum"],
    enabled: !!projetoId,
    queryFn: async (): Promise<CampoPersonalizado[]> => {
      const { data, error } = await supabase
        .from("tarefas_campos_projeto")
        .select("campo_id,obrigatorio,ordem, tarefas_campos(id,nome,tipo,opcoes,ativo)")
        .eq("projeto_id", projetoId!)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? [])
        .filter((l) => l.tarefas_campos?.ativo)
        .map((l) => ({
          campo_id: l.campo_id,
          nome: l.tarefas_campos!.nome,
          tipo: l.tarefas_campos!.tipo as TipoCampo,
          opcoes: l.tarefas_campos!.opcoes,
          obrigatorio: l.obrigatorio,
          ordem: l.ordem,
        }));
    },
  });
}

export function useValoresCampos(tarefaId: string | null) {
  return useQuery({
    queryKey: ["tarefas", "campos-valores", tarefaId],
    enabled: !!tarefaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefas_campos_valores")
        .select("campo_id,valor")
        .eq("tarefa_id", tarefaId!);
      if (error) throw error;
      const mapa: Record<string, unknown> = {};
      for (const l of data ?? []) mapa[l.campo_id] = l.valor;
      return mapa;
    },
  });
}

export function useSalvarValorCampo(tarefaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ campoId, valor }: { campoId: string; valor: unknown }) => {
      const atualizado_por = await uidAtual();
      const { error } = await supabase.from("tarefas_campos_valores").upsert({
        tarefa_id: tarefaId,
        campo_id: campoId,
        valor: valor as never,
        atualizado_por,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tarefas"] });
      qc.invalidateQueries({ queryKey: ["tarefas", "campos-valores", tarefaId] });
    },
    onError: (e: Error) => toast.error(`Não foi possível salvar o campo: ${e.message}`),
  });
}
