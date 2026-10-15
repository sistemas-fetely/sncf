import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/errorMessages";

export type CanalPainel = "total" | "b2b" | "b2c" | "interno";

export interface PainelKpis {
  remessas: number; pedidos: number;
  receita_frete: number; custo_frete: number; custo_fatura: number; custo_api: number; custo_postagem: number;
  custo_estimado_sem_real: number | null; margem: number; recuperacao_pct: number | null;
  valor_mercadoria: number; frete_cobrado_sobre_venda_pct: number | null; subsidio_sobre_venda_pct: number | null;
  remessas_com_custo_real: number; cobertura_custo_pct: number | null; remessas_com_frete_cobrado: number;
  orfas: { nf: number; postagem: number; cte: number; custo: number | null };
}
export interface PainelSerieMes { mes: string; receita: number; custo: number; margem: number; remessas: number; cobertura_custo_pct: number | null }
export interface PainelTransportadora {
  transportadora_id: string | null; transportadora: string; canal: string; remessas: number;
  receita: number; custo: number; margem: number; recuperacao_pct: number | null;
  cobertura_custo_pct: number | null; custo_fonte_dominante: "fatura" | "api" | "postagem" | null; custo_cego_desde: string | null;
}
export interface PainelUf { uf: string; remessas: number; custo: number; receita: number; custo_medio: number | null }
export interface PainelEntrega {
  remessas: number; entregues: number; em_transito: number; atencao: number; devolucao: number; sem_estado: number;
  mensuraveis: number; otd_pct: number | null; prazo_medio_dias: number | null; valor_em_transito: number | null;
  por_estado: Record<string, number>;
}
export interface PainelAlimentacao {
  transportadora_id: string; transportadora: string;
  modo_custo: "fatura_planilha" | "api_cte" | "lancamento_postagem" | "sem_custo";
  custo_fallback: "api_cte" | "lancamento_postagem" | null;
  modo_rastreio: "api" | "planilha" | "correios_api" | "sem_rastreio";
  tem_tabela_preco: boolean; tem_cotacao_api: boolean; importa_fatura: boolean; importa_rastreio: boolean; canais: string[];
  ultima_fatura_doc: string | null; ultima_fatura_import: string | null; ultima_api_sync: string | null;
  ultimo_rastreio_import: string | null; ultima_postagem: string | null; ultima_postagem_import: string | null;
}
export interface PainelLogisticaResultado {
  escopo: { canal: string; transportadora_id: string | null; de: string; ate: string; gerado_em: string };
  kpis: PainelKpis; serie_mensal: PainelSerieMes[]; por_transportadora: PainelTransportadora[]; por_uf: PainelUf[];
  entrega: PainelEntrega; custo_por_fonte: Record<string, number>; alimentacao: PainelAlimentacao[];
  fila_atencao: { total: number; exige_acao_nossa: number };
}
export interface EscopoPainel { canal: CanalPainel; transportadoraId?: string | null; de?: string | null; ate?: string | null }

export function useLogisticaPainel(escopo: EscopoPainel) {
  return useQuery({
    queryKey: ["logistica", "painel", escopo.canal, escopo.transportadoraId ?? null, escopo.de ?? null, escopo.ate ?? null],
    queryFn: async (): Promise<PainelLogisticaResultado> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_logistica_painel", {
        p_canal: escopo.canal,
        p_transportadora_id: escopo.transportadoraId ?? null,
        p_de: escopo.de ?? null,
        p_ate: escopo.ate ?? null,
      });
      if (error) throw new Error(humanizeError(error.message));
      if (!data || typeof data !== "object" || !("kpis" in data)) throw new Error("Painel de logística voltou vazio do banco.");
      return data as PainelLogisticaResultado;
    },
    staleTime: 2 * 60 * 1000,
  });
}
