import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Movimentacao {
  id: string;
  tipo: string;
  colaborador_id: string | null;
  contrato_pj_id: string | null;
  data_efetivacao: string;
  cargo_anterior: string | null;
  cargo_novo: string | null;
  departamento_anterior: string | null;
  departamento_novo: string | null;
  salario_anterior: number | null;
  salario_novo: number | null;
  motivo: string | null;
  observacoes: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MovimentacaoComNome extends Movimentacao {
  nome: string;
  vinculo: "CLT" | "PJ";
}

export function useMovimentacoes() {
  return useQuery({
    queryKey: ["movimentacoes"],
    queryFn: async () => {
      const { data: movs, error } = await supabase
        .from("movimentacoes")
        .select("*")
        .order("data_efetivacao", { ascending: false });

      if (error) throw error;

      const colabIds = [...new Set((movs || []).filter((m) => m.colaborador_id).map((m) => m.colaborador_id!))];
      const pjIds = [...new Set((movs || []).filter((m) => m.contrato_pj_id).map((m) => m.contrato_pj_id!))];

      const [{ data: colabs }, { data: pjs }] = await Promise.all([
        colabIds.length > 0
          ? supabase.from("colaboradores_clt").select("id, nome_completo").in("id", colabIds)
          : Promise.resolve({ data: [] as { id: string; nome_completo: string }[] }),
        pjIds.length > 0
          ? supabase.from("contratos_pj").select("id, contato_nome, razao_social").in("id", pjIds)
          : Promise.resolve({ data: [] as { id: string; contato_nome: string; razao_social: string }[] }),
      ]);

      const colabMap = Object.fromEntries((colabs || []).map((c) => [c.id, c.nome_completo]));
      const pjMap = Object.fromEntries((pjs || []).map((p) => [p.id, p.contato_nome || p.razao_social]));

      return (movs || []).map((m): MovimentacaoComNome => ({
        ...m,
        nome: m.colaborador_id ? (colabMap[m.colaborador_id] || "—") : (m.contrato_pj_id ? (pjMap[m.contrato_pj_id] || "—") : "—"),
        vinculo: m.colaborador_id ? "CLT" : "PJ",
      }));
    },
  });
}

export function useColaboradoresAtivos() {
  return useQuery({
    queryKey: ["colaboradores_ativos_mov"],
    queryFn: async () => {
      const { data } = await supabase
        .from("colaboradores_clt")
        .select("id, nome_completo, cargo, departamento, salario_base")
        .eq("status", "ativo")
        .order("nome_completo");
      return data || [];
    },
  });
}

export function useContratosPJAtivos() {
  return useQuery({
    queryKey: ["contratos_pj_ativos_mov"],
    queryFn: async () => {
      const { data } = await supabase
        .from("contratos_pj")
        .select("id, contato_nome, razao_social, tipo_servico, departamento, valor_mensal")
        .eq("status", "ativo")
        .order("contato_nome");
      return data || [];
    },
  });
}

export function useCriarMovimentacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<Movimentacao, "id" | "created_at" | "updated_at">) => {
      const { error } = await supabase.from("movimentacoes").insert(payload as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["movimentacoes"] });
      toast.success("Movimentação registrada com sucesso");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useAtualizarStatusMovimentacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("movimentacoes").update({ status } as any).eq("id", id);
      if (error) throw error;

      // Ao efetivar, atualizar dados na tabela de origem
      if (status === "efetivada") {
        const { data: mov } = await supabase
          .from("movimentacoes")
          .select("*")
          .eq("id", id)
          .single();

        if (mov?.colaborador_id) {
          const updates: Record<string, any> = {};
          if (mov.cargo_novo) updates.cargo = mov.cargo_novo;
          if (mov.departamento_novo) updates.departamento = mov.departamento_novo;
          if (mov.salario_novo != null) updates.salario_base = mov.salario_novo;
          if (Object.keys(updates).length > 0) {
            const { error: updErr } = await supabase
              .from("colaboradores_clt")
              .update(updates as any)
              .eq("id", mov.colaborador_id);
            if (updErr) throw updErr;
          }
        } else if (mov?.contrato_pj_id) {
          const updates: Record<string, any> = {};
          if (mov.cargo_novo) updates.tipo_servico = mov.cargo_novo;
          if (mov.departamento_novo) updates.departamento = mov.departamento_novo;
          if (mov.salario_novo != null) updates.valor_mensal = mov.salario_novo;
          if (Object.keys(updates).length > 0) {
            // LEGADO→PESSOAS fatia 2 (25/09/2026): contratos_pj é somente leitura — FAIL-LOUD
            // com a mensagem real, sem marcar a movimentação como aplicada.
            const { error: updErr } = await supabase
              .from("contratos_pj")
              .update(updates as any)
              .eq("id", mov.contrato_pj_id);
            if (updErr) {
              throw new Error(
                `Reajuste de PJ ainda grava no contrato antigo (somente leitura). Ajuste o valor no vínculo em Pessoas. (${updErr.message})`
              );
            }
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["movimentacoes"] });
      qc.invalidateQueries({ queryKey: ["colaboradores_ativos_mov"] });
      qc.invalidateQueries({ queryKey: ["contratos_pj_ativos_mov"] });
      toast.success("Status atualizado");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useExcluirMovimentacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("movimentacoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["movimentacoes"] });
      toast.success("Movimentação excluída");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
