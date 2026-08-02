/**
 * Mapa pedido_id -> hipóteses (vw_pedido_hipotese), buscado de uma vez.
 * A view é barata (~34ms, poucas dezenas de linhas), então NÃO há busca por
 * linha nem `enabled` sob demanda — diferente do dossiê, que é caro.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type HipoteseResumoRow = {
  pedido_id: string | null;
  regra_codigo: string | null;
  regra_rotulo: string | null;
  confianca: string | null;
  confianca_rotulo: string | null;
  confianca_cor: string | null;
  acao: string | null;
  rota: string | null;
  tela: string | null;
  permite_lote: boolean | null;
  evidencia_texto: string | null;
  valor_em_jogo: number | null;
};

export function useHipoteseMap() {
  const q = useQuery({
    queryKey: ["pedido-hipotese"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_pedido_hipotese")
        .select("*");
      if (error) throw error;
      return (data ?? []) as HipoteseResumoRow[];
    },
  });

  const mapa = useMemo(() => {
    const m = new Map<string, HipoteseResumoRow[]>();
    for (const h of q.data ?? []) {
      if (!h.pedido_id) continue;
      const arr = m.get(h.pedido_id) ?? [];
      arr.push(h);
      m.set(h.pedido_id, arr);
    }
    return m;
  }, [q.data]);

  /** Hipótese principal do pedido: a de maior confiança (alta > média > resto). */
  const principal = (pedidoId: string | null | undefined): HipoteseResumoRow | null => {
    if (!pedidoId) return null;
    const arr = mapa.get(pedidoId);
    if (!arr || arr.length === 0) return null;
    const peso = (h: HipoteseResumoRow) =>
      h.confianca_cor === "emerald" ? 0 : h.confianca_cor === "amber" ? 1 : 2;
    return [...arr].sort((a, b) => peso(a) - peso(b))[0];
  };

  return { mapa, principal, isLoading: q.isLoading, isError: q.isError, error: q.error };
}
