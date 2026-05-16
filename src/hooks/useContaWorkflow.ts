import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export const STATUS_FLOW = [
  { key: "aberto", label: "Aberto" },
  { key: "aprovado", label: "Aprovado" },
  { key: "enviado_para_pagamento", label: "Aguardando pagamento" },
] as const;

export type ContaStatus =
  | "aberto"
  | "aprovado"
  | "enviado_para_pagamento"
  | "cancelado";

export function useContaWorkflow() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const mudarStatus = useMutation({
    mutationFn: async (params: {
      contaId: string;
      statusAnterior: string;
      novoStatus: ContaStatus;
      observacao?: string;
      extras?: Record<string, unknown>;
    }) => {
      const { contaId, statusAnterior, novoStatus, observacao, extras } = params;

      // Histórico
      await supabase.from("contas_pagar_historico").insert({
        conta_id: contaId,
        status_anterior: statusAnterior,
        status_novo: novoStatus,
        observacao: observacao || null,
        usuario_id: user?.id || null,
      });

      const updateData: Record<string, unknown> = {
        status: novoStatus,
        updated_at: new Date().toISOString(),
        ...(extras || {}),
      };

      if (novoStatus === "aprovado") {
        updateData.aprovado_por = user?.id || null;
        updateData.aprovado_em = new Date().toISOString();
      }

      const { error } = await supabase
        .from("contas_pagar_receber")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(updateData as any)
        .eq("id", contaId);

      if (error) throw error;
      return { contaId, novoStatus };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["conta-pagar-detalhe"] });
      qc.invalidateQueries({ queryKey: ["cp-historico"] });
    },
    onError: (e: Error) => {
      toast.error("Erro: " + (e.message || String(e)));
    },
  });

  return { mudarStatus };
}

export function useHistoricoConta(contaId: string | null) {
  return useQuery({
    queryKey: ["cp-historico", contaId],
    enabled: !!contaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_pagar_historico")
        .select("*")
        .eq("conta_id", contaId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function calcularDiasVencimento(dataVencimento: string | null): number | null {
  if (!dataVencimento) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(dataVencimento + (dataVencimento.length === 10 ? "T00:00:00" : ""));
  venc.setHours(0, 0, 0, 0);
  return Math.ceil((venc.getTime() - hoje.getTime()) / 86400000);
}
