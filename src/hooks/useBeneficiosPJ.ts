import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BeneficioPJComContrato {
  id: string;
  contrato_id: string;
  tipo: string;
  descricao: string | null;
  operadora: string | null;
  numero_cartao: string | null;
  valor_empresa: number;
  valor_desconto: number;
  data_inicio: string;
  data_fim: string | null;
  status: string;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  contrato?: {
    contato_nome: string;
    tipo_servico: string;
    departamento: string;
  };
}

export function useBeneficiosPJ() {
  return useQuery({
    queryKey: ["beneficios_pj"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("beneficios_pj")
        .select("*, contratos_pj!inner(contato_nome, tipo_servico, departamento)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((b: any) => ({
        ...b,
        contrato: b.contratos_pj,
      })) as BeneficioPJComContrato[];
    },
  });
}

export function useCriarBeneficioPJ() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      contrato_id: string;
      tipo: string;
      descricao?: string;
      operadora?: string;
      numero_cartao?: string;
      valor_empresa: number;
      valor_desconto: number;
      data_inicio: string;
      data_fim?: string;
      observacoes?: string;
    }) => {
      const { data, error } = await (supabase as any)
        .from("beneficios_pj")
        .insert(input as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["beneficios_pj"] });
      toast.success("Benefício PJ cadastrado");
    },
    onError: () => toast.error("Erro ao cadastrar benefício PJ"),
  });
}

export function useEditarBeneficioPJ() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: {
      id: string;
      tipo?: string;
      descricao?: string | null;
      operadora?: string | null;
      numero_cartao?: string | null;
      valor_empresa?: number;
      valor_desconto?: number;
      data_inicio?: string;
      data_fim?: string | null;
      status?: string;
      observacoes?: string | null;
    }) => {
      const { error } = await (supabase as any)
        .from("beneficios_pj")
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["beneficios_pj"] });
      toast.success("Benefício PJ atualizado");
    },
    onError: () => toast.error("Erro ao atualizar benefício PJ"),
  });
}

export function useExcluirBeneficioPJ() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("beneficios_pj")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["beneficios_pj"] });
      toast.success("Benefício PJ excluído");
    },
    onError: () => toast.error("Erro ao excluir benefício PJ"),
  });
}
