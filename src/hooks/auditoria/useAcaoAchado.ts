/**
 * Ação do achado — a ação é DADO, vem da regra (rpc_acao / rpc_acao_param).
 * A tela não conhece nome de regra nem regra de elegibilidade: quem decide é o banco.
 * Fluxo de dois passos: simular (p_simular: true) e confirmar (p_simular: false).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CHAVES_AUDITORIA } from "./useAuditoria";

export type RetornoAcao = {
  ok?: boolean;
  erro?: string;
  simulacao?: boolean;
  gravaria?: Record<string, unknown> | null;
  // contexto da simulação
  nsu?: string | number | null;
  data_venda?: string | null;
  venda_bruto?: number | null;
  soma_titulos?: number | null;
  qtd_titulos?: number | null;
  pedido_ancora?: string | null;
  remessa_sem_titulo?: number | null;
  classificacao?: string | null;
  // gravado
  adiantamento_id?: string | null;
  valor?: number | null;
  status?: string | null;
} & Record<string, unknown>;

export type ArgsAcao = {
  rpc: string;
  param: string;
  valor: string | number | null;
  userId: string;
  simular: boolean;
};

export function useExecutarAcaoAchado() {
  return useMutation({
    mutationFn: async (args: ArgsAcao): Promise<RetornoAcao> => {
      const payload: Record<string, unknown> = {
        [`p_${args.param}`]: args.valor,
        p_user_id: args.userId,
        p_simular: args.simular,
      };
      const { data, error } = await supabase.rpc(
        args.rpc as never,
        payload as never,
      );
      if (error) throw error;
      return (data ?? {}) as RetornoAcao;
    },
  });
}

/** Reexecuta só a regra do achado: ele sai dos vivos porque o problema deixou de existir. */
export function useRodarRegraDoAchado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { userId: string; regraSlug: string }) => {
      const { data, error } = await supabase.rpc("fn_auditoria_rodar", {
        p_origem: "tela",
        p_user_id: args.userId,
        p_regra_slug: args.regraSlug,
        p_teto_ms: 60000,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: CHAVES_AUDITORIA.achados }),
        qc.invalidateQueries({ queryKey: CHAVES_AUDITORIA.painel }),
        qc.invalidateQueries({ queryKey: CHAVES_AUDITORIA.execucoes }),
        qc.invalidateQueries({ queryKey: ["auditoria", "saude"] }),
      ]);
    },
  });
}
