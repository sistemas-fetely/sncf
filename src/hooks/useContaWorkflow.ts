/**
 * ATENÇÃO: `useContaWorkflow` e `mudarStatus` foram REMOVIDOS em 02/09/2026
 * (Camada 3c da reforma ESTADO × PROVAS). Faziam UPDATE direto em
 * `contas_pagar_receber.status` pelo cliente, contornando toda a validação de
 * `fn_titulo_pagar_transicionar` (transição legal, motivo, data).
 *
 * MECANISMO-ANTES-DE-UPDATE: a única via de mudança de estado do título a pagar
 * é `useTituloPagarTransicionar` em `@/hooks/financeiro/useTituloPagarEstado`.
 * NÃO recriar mutation de status aqui.
 *
 * O que sobrou neste arquivo é leitura e cálculo, sem efeito colateral.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
