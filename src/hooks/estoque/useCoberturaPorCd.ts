import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CanalCobertura = "B2C" | "VD" | "B2B";
export interface FaltaCd { sku: string; pedido: number; disponivel: number }
export interface CoberturaCd { codigo: string; nome: string | null; itens: number; cobertos: number; cobre: boolean; faltas: FaltaCd[] }
export interface ItemCobertura { sku: string; qtd: number }

/** Normaliza (soma por SKU, ignora vazios/qtd ≤ 0) e ordena — chave estável. */
export function normalizarItensCobertura(itens: ItemCobertura[]): ItemCobertura[] {
  const m = new Map<string, number>();
  for (const i of itens) {
    const sku = (i.sku ?? "").trim();
    const q = Number(i.qtd);
    if (!sku || !(q > 0)) continue;
    m.set(sku, (m.get(sku) ?? 0) + q);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([sku, qtd]) => ({ sku, qtd }));
}

/**
 * Cobertura de cada CD para um conjunto de itens (fn_cobertura_por_cd).
 * Informação, não trava: quem usa nunca bloqueia a escolha por ela.
 */
export function useCoberturaPorCd(itens: ItemCobertura[], canal: CanalCobertura, opts?: { debounceMs?: number; enabled?: boolean }) {
  const norm = useMemo(() => normalizarItensCobertura(itens), [itens]);
  const chave = JSON.stringify(norm);
  const [chaveDeb, setChaveDeb] = useState(chave);
  const ms = opts?.debounceMs ?? 0;
  useEffect(() => {
    if (!ms) { setChaveDeb(chave); return; }
    const t = setTimeout(() => setChaveDeb(chave), ms);
    return () => clearTimeout(t);
  }, [chave, ms]);
  const efetiva = ms ? chaveDeb : chave;

  const q = useQuery({
    queryKey: ["fn_cobertura_por_cd", canal, efetiva],
    enabled: (opts?.enabled ?? true) && efetiva !== "[]",
    staleTime: 30_000,
    queryFn: async (): Promise<CoberturaCd[]> => {
      const { data, error } = await supabase.rpc("fn_cobertura_por_cd", { p_itens: JSON.parse(efetiva), p_canal: canal });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as unknown as CoberturaCd[];
    },
  });
  const porCodigo = useMemo(() => new Map((q.data ?? []).map((c) => [c.codigo, c])), [q.data]);
  return { ...q, porCodigo };
}
