import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { KEY_GESTAO } from "./useGestaoSalas";

/**
 * Decisões. Decisão carimbada em reunião fechada é IMUTÁVEL — o banco recusa a
 * edição. A saída legítima é registrar uma REVISÃO (decisão nova com
 * revisao_de_id) e marcar a antiga como 'revista'.
 */

export const STATUS_DECISAO_ROTULO: Record<string, string> = {
  vigente: "Vigente",
  revista: "Revista",
  revogada: "Revogada",
};

export interface Decisao {
  id: string;
  titulo: string;
  contexto: string | null;
  decisao: string;
  projeto_id: string | null;
  sala_origem_id: string | null;
  reuniao_id: string | null;
  decidida_por_pessoa_id: string | null;
  decidida_em: string | null;
  reversivel: boolean | null;
  status: string;
  revisao_de_id: string | null;
  revisitar_em: string | null;
  criado_em: string | null;
}

const CAMPOS =
  "id,titulo,contexto,decisao,projeto_id,sala_origem_id,reuniao_id,decidida_por_pessoa_id,decidida_em,reversivel,status,revisao_de_id,revisitar_em,criado_em" as const;

export function useDecisoes(filtros: { status?: string | null; projetoId?: string | null } = {}) {
  const { status, projetoId } = filtros;
  return useQuery({
    queryKey: [...KEY_GESTAO, "decisoes", status ?? "-", projetoId ?? "-"],
    queryFn: async (): Promise<Decisao[]> => {
      let q = supabase.from("gestao_decisao").select(CAMPOS);
      if (status) q = q.eq("status", status);
      if (projetoId) q = q.eq("projeto_id", projetoId);
      const { data, error } = await q
        .order("decidida_em", { ascending: false, nullsFirst: false })
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Decisao[];
    },
  });
}

export interface NovaDecisao {
  titulo: string;
  contexto: string | null;
  decisao: string;
  projeto_id: string | null;
  sala_origem_id: string | null;
  reuniao_id: string | null;
  reversivel: boolean;
  revisitar_em: string | null;
}

export function useRegistrarDecisao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (valores: NovaDecisao): Promise<string> => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("gestao_decisao")
        .insert({ ...valores, status: "vigente", criado_por: auth.user?.id ?? null })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY_GESTAO });
      toast.success("Decisão registrada");
    },
    onError: (e: Error) => toast.error(`Não foi possível registrar a decisão: ${e.message}`),
  });
}

/**
 * Revisão: nasce uma decisão nova apontando para a antiga, e a antiga passa a
 * 'revista'. Se o banco recusar qualquer das duas etapas, o erro aparece.
 */
export function useRegistrarRevisaoDecisao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      original,
      valores,
    }: {
      original: Decisao;
      valores: Omit<NovaDecisao, "sala_origem_id" | "reuniao_id">;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error: erroInsert } = await supabase.from("gestao_decisao").insert({
        ...valores,
        sala_origem_id: original.sala_origem_id,
        reuniao_id: null,
        revisao_de_id: original.id,
        status: "vigente",
        criado_por: auth.user?.id ?? null,
      });
      if (erroInsert) throw erroInsert;
      const { error: erroUpdate } = await supabase
        .from("gestao_decisao")
        .update({ status: "revista" })
        .eq("id", original.id);
      if (erroUpdate) throw erroUpdate;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY_GESTAO });
      toast.success("Revisão registrada");
    },
    onError: (e: Error) => toast.error(`Não foi possível registrar a revisão: ${e.message}`),
  });
}
