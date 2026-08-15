import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

/** Campos personalizados: catálogo (tarefas_campos) e vínculo com o projeto. */

export type CampoTipo =
  | "texto" | "numero" | "moeda" | "data" | "selecao" | "multi_selecao" | "pessoa" | "checkbox";

export const CAMPO_TIPO_ROTULO: Record<CampoTipo, string> = {
  texto: "Texto", numero: "Número", moeda: "Moeda", data: "Data",
  selecao: "Seleção", multi_selecao: "Multi-seleção", pessoa: "Pessoa", checkbox: "Sim/Não",
};

export interface CampoCatalogo {
  id: string;
  nome: string;
  descricao: string | null;
  tipo: CampoTipo;
  opcoes: Json;
  ativo: boolean;
}

export function useCamposCatalogo() {
  return useQuery({
    queryKey: ["tarefas", "campos-catalogo"],
    queryFn: async (): Promise<CampoCatalogo[]> => {
      const { data, error } = await supabase
        .from("tarefas_campos")
        .select("id,nome,descricao,tipo,opcoes,ativo")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as CampoCatalogo[];
    },
  });
}

export interface CampoDoProjeto {
  campo_id: string;
  obrigatorio: boolean;
  mostrar_no_card: boolean;
  ordem: number;
}

export function useCamposDoProjeto(projetoId: string | null) {
  return useQuery({
    queryKey: ["tarefas", "campos-projeto", projetoId ?? "nenhum"],
    enabled: !!projetoId,
    queryFn: async (): Promise<CampoDoProjeto[]> => {
      const { data, error } = await supabase
        .from("tarefas_campos_projeto")
        .select("campo_id,obrigatorio,mostrar_no_card,ordem")
        .eq("projeto_id", projetoId!)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as CampoDoProjeto[];
    },
  });
}

function useInvalidarCampos(projetoId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["tarefas", "campos-projeto", projetoId] });
    qc.invalidateQueries({ queryKey: ["tarefas", "campos-catalogo"] });
    qc.invalidateQueries({ queryKey: ["tarefas", "valores-campos", projetoId] });
  };
}

export function useVincularCampo(projetoId: string) {
  const invalidar = useInvalidarCampos(projetoId);
  return useMutation({
    mutationFn: async ({ campoId, ordem }: { campoId: string; ordem: number }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("tarefas_campos_projeto").insert({
        projeto_id: projetoId,
        campo_id: campoId,
        ordem,
        criado_por: auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success("Campo ligado ao projeto");
    },
    onError: (e: Error) => toast.error(`Não foi possível ligar o campo: ${e.message}`),
  });
}

export function useAtualizarCampoProjeto(projetoId: string) {
  const invalidar = useInvalidarCampos(projetoId);
  return useMutation({
    mutationFn: async ({
      campoId, patch,
    }: { campoId: string; patch: Partial<Omit<CampoDoProjeto, "campo_id">> }) => {
      const { error } = await supabase
        .from("tarefas_campos_projeto")
        .update(patch)
        .eq("projeto_id", projetoId)
        .eq("campo_id", campoId);
      if (error) throw error;
    },
    onSuccess: () => invalidar(),
    onError: (e: Error) => toast.error(`Não foi possível atualizar o campo: ${e.message}`),
  });
}

export function useDesvincularCampo(projetoId: string) {
  const invalidar = useInvalidarCampos(projetoId);
  return useMutation({
    mutationFn: async (campoId: string) => {
      const { error } = await supabase
        .from("tarefas_campos_projeto")
        .delete()
        .eq("projeto_id", projetoId)
        .eq("campo_id", campoId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidar();
      toast.success("Campo removido do projeto");
    },
    onError: (e: Error) => toast.error(`Não foi possível remover o campo: ${e.message}`),
  });
}

export function useCriarCampo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      nome, tipo, opcoes,
    }: { nome: string; tipo: CampoTipo; opcoes: string[] }): Promise<string> => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("tarefas_campos")
        .insert({
          nome,
          tipo,
          opcoes: opcoes as unknown as Json,
          criado_por: auth.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tarefas", "campos-catalogo"] });
      toast.success("Campo criado");
    },
    onError: (e: Error) => toast.error(`Não foi possível criar o campo: ${e.message}`),
  });
}

export interface ValorCampo {
  tarefa_id: string;
  campo_id: string;
  valor: Json;
}

/** Valores dos campos marcados para aparecer no card, das tarefas do projeto. */
export function useValoresCamposDoBoard(projetoId: string | null, tarefaIds: string[], campoIds: string[]) {
  const chave = `${tarefaIds.length}:${campoIds.slice().sort().join(",")}`;
  return useQuery({
    queryKey: ["tarefas", "valores-campos", projetoId ?? "nenhum", chave],
    enabled: !!projetoId && tarefaIds.length > 0 && campoIds.length > 0,
    queryFn: async (): Promise<ValorCampo[]> => {
      const { data, error } = await supabase
        .from("tarefas_campos_valores")
        .select("tarefa_id,campo_id,valor")
        .in("tarefa_id", tarefaIds)
        .in("campo_id", campoIds);
      if (error) throw error;
      return (data ?? []) as ValorCampo[];
    },
  });
}

export function formatarValorCampo(tipo: CampoTipo, valor: Json): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (tipo === "checkbox") return valor === true || valor === "true" ? "Sim" : "Não";
  if (tipo === "moeda") {
    const n = Number(valor);
    return Number.isFinite(n)
      ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : String(valor);
  }
  if (tipo === "data") {
    const s = String(valor);
    const [a, m, d] = s.slice(0, 10).split("-");
    return d ? `${d}/${m}/${a}` : s;
  }
  if (Array.isArray(valor)) return valor.map((v) => String(v)).join(", ");
  return String(valor);
}
