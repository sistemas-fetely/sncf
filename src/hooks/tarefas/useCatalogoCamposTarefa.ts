import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import type { CampoTipo } from "@/hooks/tarefas/useProjetoCampos";

/**
 * Catálogo de campos de tarefa — dono da empresa inteira.
 * Leitura pela view vw_campo_tarefa_uso (traz uso real: projetos ligados e
 * valores preenchidos). Escrita direto em tarefas_campos. FAIL-LOUD.
 */

export interface CampoCatalogoUso {
  id: string;
  nome: string;
  descricao: string | null;
  tipo: CampoTipo;
  opcoes: Json;
  departamento_id: string | null;
  departamento: string | null;
  ativo: boolean;
  criado_em: string | null;
  projetos_ligados: number;
  valores_preenchidos: number;
  pode_apagar: boolean;
}

export const CHAVE_CATALOGO = ["tarefas", "campos-catalogo-uso"] as const;

export function useCatalogoCamposTarefa() {
  return useQuery({
    queryKey: CHAVE_CATALOGO,
    queryFn: async (): Promise<CampoCatalogoUso[]> => {
      const { data, error } = await supabase
        .from("vw_campo_tarefa_uso")
        .select(
          "id,nome,descricao,tipo,opcoes,departamento_id,departamento,ativo,criado_em,projetos_ligados,valores_preenchidos,pode_apagar",
        )
        .order("nome");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: String(r.id),
        nome: r.nome ?? "(sem nome)",
        descricao: r.descricao ?? null,
        tipo: (r.tipo ?? "texto") as CampoTipo,
        opcoes: r.opcoes ?? [],
        departamento_id: r.departamento_id ?? null,
        departamento: r.departamento ?? null,
        ativo: r.ativo ?? true,
        criado_em: r.criado_em ?? null,
        projetos_ligados: Number(r.projetos_ligados ?? 0),
        valores_preenchidos: Number(r.valores_preenchidos ?? 0),
        pode_apagar: r.pode_apagar === true,
      }));
    },
  });
}

export function useDepartamentosAtivos() {
  return useQuery({
    queryKey: ["departamentos", "ativos"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<{ id: string; nome: string }[]> => {
      const { data, error } = await supabase
        .from("departamentos")
        .select("id,nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });
}

function useInvalidarCatalogo() {
  const qc = useQueryClient();
  return async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: CHAVE_CATALOGO }),
      qc.invalidateQueries({ queryKey: ["tarefas", "campos-catalogo"] }),
    ]);
  };
}

export interface NovoCampoPayload {
  nome: string;
  descricao: string | null;
  tipo: CampoTipo;
  departamento_id: string | null;
  opcoes: string[];
}

export function useCriarCampoCatalogo() {
  const invalidar = useInvalidarCatalogo();
  return useMutation({
    mutationFn: async (p: NovoCampoPayload): Promise<string> => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("tarefas_campos")
        .insert({
          nome: p.nome,
          descricao: p.descricao,
          tipo: p.tipo,
          departamento_id: p.departamento_id,
          opcoes: p.opcoes as unknown as Json,
          criado_por: auth.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: async () => {
      await invalidar();
      toast.success("Campo criado no catálogo");
    },
    onError: (e: Error) => toast.error(`Não foi possível criar o campo: ${e.message}`),
  });
}

export interface EditarCampoPayload {
  id: string;
  nome: string;
  descricao: string | null;
  departamento_id: string | null;
  opcoes: string[];
  /** Só vai ao banco quando o campo não tem valores preenchidos. */
  tipo?: CampoTipo;
}

export function useEditarCampoCatalogo() {
  const invalidar = useInvalidarCatalogo();
  return useMutation({
    mutationFn: async (p: EditarCampoPayload) => {
      const patch: Record<string, unknown> = {
        nome: p.nome,
        descricao: p.descricao,
        departamento_id: p.departamento_id,
        opcoes: p.opcoes as unknown as Json,
      };
      if (p.tipo) patch.tipo = p.tipo;
      const { error } = await supabase.from("tarefas_campos").update(patch).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await invalidar();
      toast.success("Campo atualizado");
    },
    onError: (e: Error) => toast.error(`Não foi possível salvar o campo: ${e.message}`),
  });
}

export function useAlternarAtivoCampo() {
  const qc = useQueryClient();
  const invalidar = useInvalidarCatalogo();
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("tarefas_campos").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, ativo }) => {
      const anterior = qc.getQueryData<CampoCatalogoUso[]>(CHAVE_CATALOGO);
      if (anterior) {
        qc.setQueryData<CampoCatalogoUso[]>(
          CHAVE_CATALOGO,
          anterior.map((c) => (c.id === id ? { ...c, ativo } : c)),
        );
      }
      return { anterior };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.anterior) qc.setQueryData(CHAVE_CATALOGO, ctx.anterior);
      toast.error(`Não foi possível mudar o campo: ${e.message}`);
    },
    onSuccess: async (_d, v) => {
      await invalidar();
      toast.success(v.ativo ? "Campo reativado" : "Campo desativado");
    },
  });
}

export function useApagarCampoCatalogo() {
  const invalidar = useInvalidarCatalogo();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tarefas_campos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await invalidar();
      toast.success("Campo apagado do catálogo");
    },
    onError: (e: Error) => toast.error(`Não foi possível apagar o campo: ${e.message}`),
  });
}

export function motivoNaoPodeApagar(c: CampoCatalogoUso): string | null {
  if (c.pode_apagar) return null;
  const partes: string[] = [];
  if (c.projetos_ligados > 0)
    partes.push(`ligado a ${c.projetos_ligados} projeto${c.projetos_ligados > 1 ? "s" : ""}`);
  if (c.valores_preenchidos > 0)
    partes.push(`tem ${c.valores_preenchidos} valor${c.valores_preenchidos > 1 ? "es" : ""} preenchido${c.valores_preenchidos > 1 ? "s" : ""}`);
  return partes.length ? partes.join(" e ") : "em uso";
}

export function opcoesParaTexto(opcoes: Json): string {
  if (Array.isArray(opcoes)) return opcoes.map((o) => String(o)).join(", ");
  return "";
}
