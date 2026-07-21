import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BeneficioComColaborador {
  id: string;
  colaborador_id: string;
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
  colaborador?: {
    nome_completo: string;
    cargo: string;
    departamento: string;
  };
}

export function useBeneficios() {
  return useQuery({
    queryKey: ["beneficios"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("beneficios_colaborador")
        .select("*, colaboradores_clt!inner(nome_completo, cargo, departamento)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((b: any) => ({
        ...b,
        colaborador: b.colaboradores_clt,
      })) as BeneficioComColaborador[];
    },
  });
}

export function useCriarBeneficio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      colaborador_id: string;
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
        .from("beneficios_colaborador")
        .insert(input as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["beneficios"] });
      toast.success("Benefício cadastrado");
    },
    onError: () => toast.error("Erro ao cadastrar benefício"),
  });
}

export function useEditarBeneficio() {
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
        .from("beneficios_colaborador")
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["beneficios"] });
      toast.success("Benefício atualizado");
    },
    onError: () => toast.error("Erro ao atualizar benefício"),
  });
}

export function useExcluirBeneficio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("beneficios_colaborador")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["beneficios"] });
      toast.success("Benefício excluído");
    },
    onError: () => toast.error("Erro ao excluir benefício"),
  });
}
