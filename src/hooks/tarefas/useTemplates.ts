import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/** Templates de projeto/checklist (F5). FAIL-LOUD em toda mutation. */

export interface Template {
  id: string;
  nome: string;
  descricao: string | null;
  tipo: string;
  departamento_id: string | null;
  ativo: boolean;
  criado_em: string;
}

export interface TemplateItem {
  id: string;
  template_id: string;
  parent_item_id: string | null;
  secao_nome: string | null;
  titulo: string;
  descricao: string | null;
  prioridade: string;
  responsavel_id: string | null;
  dias_offset: number;
  estimativa_horas: number | null;
  ordem: number;
}

const CAMPOS_TPL = "id,nome,descricao,tipo,departamento_id,ativo,criado_em" as const;
const CAMPOS_ITEM =
  "id,template_id,parent_item_id,secao_nome,titulo,descricao,prioridade,responsavel_id,dias_offset,estimativa_horas,ordem" as const;

export function useTemplates() {
  return useQuery({
    queryKey: ["tarefas", "templates"],
    queryFn: async (): Promise<Template[]> => {
      const { data, error } = await supabase
        .from("tarefas_templates")
        .select(CAMPOS_TPL)
        .order("ativo", { ascending: false })
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Template[];
    },
  });
}

export function useTemplateItens(templateId: string | null) {
  return useQuery({
    queryKey: ["tarefas", "template-itens", templateId ?? "nenhum"],
    enabled: !!templateId,
    queryFn: async (): Promise<TemplateItem[]> => {
      const { data, error } = await supabase
        .from("tarefas_template_itens")
        .select(CAMPOS_ITEM)
        .eq("template_id", templateId!)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as TemplateItem[];
    },
  });
}

export interface NovoTemplate {
  nome: string;
  descricao: string | null;
  tipo: string;
  ativo: boolean;
}

export function useSalvarTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, valores }: { id: string | null; valores: NovoTemplate }): Promise<string> => {
      if (id) {
        const { error } = await supabase.from("tarefas_templates").update(valores).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("tarefas_templates")
        .insert({ ...valores, criado_por: auth.user?.id ?? null })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tarefas", "templates"] });
      toast.success("Template salvo");
    },
    onError: (e: Error) => toast.error(`Não foi possível salvar o template: ${e.message}`),
  });
}

export function useExcluirTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tarefas_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tarefas", "templates"] });
      toast.success("Template excluído");
    },
    onError: (e: Error) => toast.error(`Não foi possível excluir o template: ${e.message}`),
  });
}

export type NovoTemplateItem = Omit<TemplateItem, "id">;

export function useSalvarTemplateItem(templateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, valores }: { id: string | null; valores: Omit<NovoTemplateItem, "template_id"> }) => {
      if (id) {
        const { error } = await supabase.from("tarefas_template_itens").update(valores).eq("id", id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("tarefas_template_itens")
        .insert({ ...valores, template_id: templateId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tarefas", "template-itens", templateId] }),
    onError: (e: Error) => toast.error(`Não foi possível salvar o item: ${e.message}`),
  });
}

export function useExcluirTemplateItem(templateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tarefas_template_itens").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tarefas", "template-itens", templateId] }),
    onError: (e: Error) => toast.error(`Não foi possível excluir o item: ${e.message}`),
  });
}

export interface AplicarTemplateArgs {
  templateId: string;
  nomeProjeto: string | null;
  dataInicio: string;
  responsavelPadrao: string | null;
  projetoExistente: string | null;
}

export function useAplicarTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: AplicarTemplateArgs): Promise<string> => {
      const { data, error } = await supabase.rpc("aplicar_template", {
        _template_id: a.templateId,
        _nome_projeto: a.nomeProjeto ?? undefined,
        _data_inicio: a.dataInicio,
        _responsavel_padrao: a.responsavelPadrao ?? undefined,
        _projeto_existente: a.projetoExistente ?? undefined,
      });
      if (error) throw error;
      return String(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tarefas"] });
      toast.success("Template aplicado");
    },
    onError: (e: Error) => toast.error(`Não foi possível aplicar o template: ${e.message}`),
  });
}

/** "Salvar projeto atual como template": lê seções e tarefas do projeto e grava template + itens. */
export function useSalvarProjetoComoTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projetoId, nome, descricao,
    }: { projetoId: string; nome: string; descricao: string | null }): Promise<string> => {
      const { data: auth } = await supabase.auth.getUser();

      const { data: secoes, error: erroSecoes } = await supabase
        .from("tarefas_secoes")
        .select("id,nome,ordem")
        .eq("projeto_id", projetoId)
        .order("ordem");
      if (erroSecoes) throw erroSecoes;

      const { data: tarefas, error: erroTarefas } = await supabase
        .from("tarefas")
        .select("id,titulo,descricao,prioridade,responsavel_id,estimativa_horas,secao_id,data_limite,ordem,parent_id")
        .eq("projeto_id", projetoId)
        .order("ordem");
      if (erroTarefas) throw erroTarefas;

      const { data: tpl, error: erroTpl } = await supabase
        .from("tarefas_templates")
        .insert({ nome, descricao, tipo: "projeto", criado_por: auth.user?.id ?? null })
        .select("id")
        .single();
      if (erroTpl) throw erroTpl;

      const nomeSecao = new Map((secoes ?? []).map((s) => [s.id, s.nome]));
      const datas = (tarefas ?? [])
        .map((t) => t.data_limite)
        .filter((d): d is string => !!d)
        .sort();
      const base = datas[0] ?? null;

      const itens = (tarefas ?? []).map((t, i) => ({
        template_id: tpl.id,
        secao_nome: t.secao_id ? nomeSecao.get(t.secao_id) ?? null : null,
        titulo: t.titulo,
        descricao: t.descricao,
        prioridade: t.prioridade,
        responsavel_id: t.responsavel_id,
        estimativa_horas: t.estimativa_horas,
        dias_offset:
          base && t.data_limite
            ? Math.max(
                0,
                Math.round(
                  (new Date(`${t.data_limite}T00:00:00`).getTime() -
                    new Date(`${base}T00:00:00`).getTime()) /
                    86400000
                )
              )
            : 0,
        ordem: t.ordem ?? i,
      }));

      if (itens.length > 0) {
        const { error: erroItens } = await supabase.from("tarefas_template_itens").insert(itens);
        if (erroItens) throw erroItens;
      }

      return tpl.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tarefas", "templates"] });
      toast.success("Projeto salvo como template");
    },
    onError: (e: Error) => toast.error(`Não foi possível salvar o template: ${e.message}`),
  });
}
