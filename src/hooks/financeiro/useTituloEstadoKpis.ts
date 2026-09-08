import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * VERDADE-UNICA-DO-VENCIDO (08/09/2026) — `vw_titulo_estado` é a ÚNICA fonte de
 * "vencido/atraso" de título a receber. Uma linha por título.
 *
 * Duas medidas, nomes diferentes, nunca misturadas:
 *  - `vencido_contabil` → a data passou, ponto. Medida do CFO (aging, DSO, provisão).
 *  - `cobravel_hoje`    → venceu em dia útil e já passou a carência D+1. Medida do
 *                          operador de cobrança.
 *  - `em_carencia_bancaria` → venceu na data, mas o vencimento efetivo é hoje/ontem
 *                          (fim de semana ou feriado). Não é atraso real ainda.
 *
 * Identidade garantida pelo banco: vencido_contabil = cobravel_hoje + em_carencia_bancaria.
 *
 * REGRA: nenhuma tela calcula vencimento/atraso por conta própria — nada de
 * `data_vencimento < hoje` no TSX, nada de subtrair datas em TS. Faixa de aging
 * vem de `faixa_aging`, não de Math.floor de milissegundos.
 */

export type FaixaAging = "1-7" | "8-30" | "31-60" | "60+";

export type TituloEstadoLinha = {
  titulo_id: string | null;
  numero_titulo: string | null;
  parceiro_id: string | null;
  pedido_id: string | null;
  status: string | null;
  valor: number | null;
  vencimento: string | null;
  vencimento_efetivo: string | null;
  vencido_contabil: boolean | null;
  dias_atraso_contabil: number | null;
  faixa_aging: string | null;
  cobravel_hoje: boolean | null;
  dias_atraso_efetivo: number | null;
  em_carencia_bancaria: boolean | null;
  liquidacao_informada: boolean | null;
  coberto_pela_conta: number | null;
  coberto_integralmente: boolean | null;
  instrumento: string | null;
  nivel_prova: string | null;
};

type Bloco = { qtd: number; valor: number };

export type TituloEstadoKpis = {
  vencidoContabil: Bloco;
  cobravelHoje: Bloco;
  emCarenciaBancaria: Bloco;
  /** Faixas de aging do vencido contábil — valores somados por `faixa_aging`. */
  faixas: Record<FaixaAging, number>;
  faixasQtd: Record<FaixaAging, number>;
};

const zero = (): Bloco => ({ qtd: 0, valor: 0 });

function agregar(linhas: TituloEstadoLinha[]): TituloEstadoKpis {
  const k: TituloEstadoKpis = {
    vencidoContabil: zero(),
    cobravelHoje: zero(),
    emCarenciaBancaria: zero(),
    faixas: { "1-7": 0, "8-30": 0, "31-60": 0, "60+": 0 },
    faixasQtd: { "1-7": 0, "8-30": 0, "31-60": 0, "60+": 0 },
  };
  for (const l of linhas) {
    const v = Number(l.valor ?? 0);
    if (l.vencido_contabil) {
      k.vencidoContabil.qtd += 1;
      k.vencidoContabil.valor += v;
      const f = l.faixa_aging as FaixaAging | null;
      if (f && f in k.faixas) {
        k.faixas[f] += v;
        k.faixasQtd[f] += 1;
      }
    }
    if (l.cobravel_hoje) {
      k.cobravelHoje.qtd += 1;
      k.cobravelHoje.valor += v;
    }
    if (l.em_carencia_bancaria) {
      k.emCarenciaBancaria.qtd += 1;
      k.emCarenciaBancaria.valor += v;
    }
  }
  return k;
}

/** Linhas cruas da fonte única. */
export function useTituloEstado() {
  return useQuery({
    queryKey: ["vw-titulo-estado"],
    queryFn: async (): Promise<TituloEstadoLinha[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_titulo_estado")
        .select(
          "titulo_id,numero_titulo,parceiro_id,pedido_id,status,valor,vencimento,vencimento_efetivo,vencido_contabil,dias_atraso_contabil,faixa_aging,cobravel_hoje,dias_atraso_efetivo,em_carencia_bancaria,liquidacao_informada,coberto_pela_conta,coberto_integralmente,instrumento,nivel_prova",
        );
      // FAIL-LOUD: sem a fonte única, a tela não inventa número.
      if (error) throw new Error(`vw_titulo_estado: ${error.message}`);
      return (data ?? []) as TituloEstadoLinha[];
    },
    staleTime: 30_000,
    refetchOnMount: "always",
  });
}

/** KPIs agregados da fonte única — usado por Cobrança e Recebíveis. */
export function useTituloEstadoKpis() {
  const q = useTituloEstado();
  return {
    ...q,
    kpis: q.data ? agregar(q.data) : undefined,
  };
}
