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
  confianca_ordem: number | null;
  classe_alvo: string[] | null;
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

  /**
   * Hipótese principal do pedido para uma classe de achado.
   * Só vale se `classe_alvo` contiver a classe do achado; ordena por
   * `confianca_ordem` (menor primeiro) — cor é só estilo.
   */
  const principal = (
    pedidoId: string | null | undefined,
    classeDoAchado?: string | null,
  ): HipoteseResumoRow | null => {
    if (!pedidoId || !classeDoAchado) return null;
    const arr = mapa.get(pedidoId);
    if (!arr || arr.length === 0) return null;
    const aplicaveis = arr.filter(
      (h) => Array.isArray(h.classe_alvo) && h.classe_alvo.includes(classeDoAchado),
    );
    if (aplicaveis.length === 0) return null;
    return [...aplicaveis].sort(
      (a, b) => (a.confianca_ordem ?? 999) - (b.confianca_ordem ?? 999),
    )[0];
  };

  return { mapa, principal, isLoading: q.isLoading, isError: q.isError, error: q.error };
}
