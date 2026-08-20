import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { KEY_GESTAO } from "./useGestaoSalas";

/** Riscos. severidade é GERADA pelo banco — nunca calculada nem enviada pelo front. */

export const STATUS_RISCO_ROTULO: Record<string, string> = {
  aberto: "Aberto",
  mitigado: "Mitigado",
  aceito: "Aceito",
  materializado: "Materializado",
};

export interface Risco {
  id: string;
  titulo: string;
  descricao: string | null;
  projeto_id: string | null;
  sala_origem_id: string | null;
  dono_pessoa_id: string | null;
  probabilidade: number;
  impacto: number;
  severidade: number | null;
  mitigacao: string | null;
  proxima_revisao: string | null;
  status: string;
  criado_em: string | null;
}

const CAMPOS =
  "id,titulo,descricao,projeto_id,sala_origem_id,dono_pessoa_id,probabilidade,impacto,severidade,mitigacao,proxima_revisao,status,criado_em" as const;

export function useRiscos(filtros: { status?: string | null; projetoId?: string | null } = {}) {
  const { status, projetoId } = filtros;
  return useQuery({
    queryKey: [...KEY_GESTAO, "riscos", status ?? "-", projetoId ?? "-"],
    queryFn: async (): Promise<Risco[]> => {
      let q = supabase.from("gestao_risco").select(CAMPOS);
      if (status) q = q.eq("status", status);
      if (projetoId) q = q.eq("projeto_id", projetoId);
      const { data, error } = await q
        .order("severidade", { ascending: false, nullsFirst: false })
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Risco[];
    },
  });
}

export interface NovoRisco {
  titulo: string;
  descricao: string | null;
  projeto_id: string | null;
  sala_origem_id: string | null;
  dono_pessoa_id: string | null;
  probabilidade: number;
  impacto: number;
  mitigacao: string | null;
  proxima_revisao: string | null;
}

export function useRegistrarRisco() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (valores: NovoRisco): Promise<string> => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("gestao_risco")
        .insert({ ...valores, status: "aberto", criado_por: auth.user?.id ?? null })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY_GESTAO });
      toast.success("Risco registrado");
    },
    onError: (e: Error) => toast.error(`Não foi possível registrar o risco: ${e.message}`),
  });
}

export function useAtualizarStatusRisco() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("gestao_risco").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY_GESTAO });
      toast.success("Risco atualizado");
    },
    onError: (e: Error) => toast.error(`Não foi possível atualizar o risco: ${e.message}`),
  });
}
