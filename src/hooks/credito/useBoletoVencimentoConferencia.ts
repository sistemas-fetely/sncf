import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { OPCOES_QUERY_RECEBIVEL } from "@/hooks/recebivel/useInvalidarRecebivel";

export type SituacaoConferencia = "CONFERE" | "DIVERGENTE" | "CEGO";
/**
 * `safra_carteira_conferencia` é alimentada por DOIS relatórios do Safra, então
 * a prova diz qual deles gravou: `instrucoes_2via` (Recebimentos - Instruções 2ª
 * via) ou `francesinha` (Gestão de Cobrança). `carteira_safra` é a linha órfã de
 * import. Rótulo de prova não se chuta.
 */
export type FonteProva =
  | "retorno_cnab"
  | "instrucoes_2via"
  | "francesinha"
  | "carteira_safra"
  | "remessa_enviada"
  | "sem_prova";

export interface BoletoVencimentoConferencia {
  titulo_id: string;
  situacao: SituacaoConferencia;
  fonte_prova: FonteProva | null;
  venc_banco: string | null;
  venc_sistema: string | null;
  dias_diferenca: number | null;
}

/**
 * Leitura da view vw_boleto_vencimento_conferencia — "a data que temos é a
 * mesma que o banco tem?". Retorna um mapa por titulo_id.
 */
export function useBoletoVencimentoConferencia() {
  return useQuery({
    queryKey: ["boleto-vencimento-conferencia"],
    ...OPCOES_QUERY_RECEBIVEL,
    queryFn: async (): Promise<Map<string, BoletoVencimentoConferencia>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_boleto_vencimento_conferencia")
        .select("titulo_id, situacao, fonte_prova, venc_banco, venc_sistema, dias_diferenca")
        .limit(2000);
      if (error) throw error;
      const mapa = new Map<string, BoletoVencimentoConferencia>();
      for (const l of (data ?? []) as BoletoVencimentoConferencia[]) {
        if (l?.titulo_id) mapa.set(l.titulo_id, l);
      }
      return mapa;
    },
    staleTime: 60_000,
  });
}
