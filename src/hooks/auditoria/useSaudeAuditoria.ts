/**
 * Saúde do sistema de auditoria. Leitura pura: RPC fn_auditoria_saude(false)
 * — a gravação do histórico é do cron, a tela nunca grava.
 * Tendência vem de vw_auditoria_saude.
 * FAIL-LOUD: erro é lançado e a tela mostra estado de erro.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const CHAVE_SAUDE_AUDITORIA = ["auditoria", "saude"] as const;
export const CHAVE_SAUDE_HISTORICO = ["auditoria", "saude", "historico"] as const;

export type FaixaSaude =
  | "saudavel"
  | "aceitavel"
  | "atencao"
  | "critico"
  | "nao_confiavel";

export type EixoSaude = {
  nota: number | null;
  peso: number;
  // gravidade
  dinheiro?: number;
  severidade?: number;
  penalidade_pontos?: number;
  // tratamento
  elegiveis?: number;
  tocados?: number;
  observacao?: string | null;
  // envelhecimento
  idade_media_dias?: number;
  // confiabilidade
  regras_ativas?: number;
  regras_ok?: number;
  regras_bloqueadas?: number;
  horas_ultima_execucao?: number;
  fator_frescor?: number;
};

export type SaudeAuditoria = {
  nota: number | null;
  faixa: FaixaSaude;
  confiavel: boolean;
  motivo_supressao: string | null;
  variacao_7d: number | null;
  variacao_30d: number | null;
  eixos: {
    gravidade: EixoSaude;
    tratamento: EixoSaude;
    envelhecimento: EixoSaude;
    confiabilidade: EixoSaude;
  };
  contexto: {
    achados_vivos: number;
    bloqueantes: number;
    atencao: number;
    informativo: number;
    valor_vivo: number;
    ancora: { nota: number; data: string; aviso: string };
  };
};

export type PontoSaude = {
  medido_em: string;
  dia: string | null;
  nota: number | null;
  confiavel: boolean | null;
  eixo_gravidade: number | null;
  eixo_tratamento: number | null;
  eixo_envelhecimento: number | null;
  eixo_confiabilidade: number | null;
  achados_vivos: number | null;
  bloqueantes: number | null;
  valor_vivo: number | null;
  faixa: string | null;
};

export function useSaudeAuditoria() {
  return useQuery({
    queryKey: CHAVE_SAUDE_AUDITORIA,
    staleTime: 30_000,
    queryFn: async (): Promise<SaudeAuditoria> => {
      const { data, error } = await (supabase as any).rpc("fn_auditoria_saude", {
        p_gravar: false,
      });
      if (error) throw error;
      if (!data) throw new Error("fn_auditoria_saude não devolveu dados");
      return data as SaudeAuditoria;
    },
  });
}

export function useHistoricoSaudeAuditoria(habilitado: boolean) {
  return useQuery({
    queryKey: CHAVE_SAUDE_HISTORICO,
    enabled: habilitado,
    staleTime: 30_000,
    queryFn: async (): Promise<PontoSaude[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_auditoria_saude")
        .select("*")
        .order("medido_em", { ascending: true })
        .limit(180);
      if (error) throw error;
      return (data ?? []) as PontoSaude[];
    },
  });
}
