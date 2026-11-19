// LISTA-PAGINADA: filtro, busca, ordenação, contagem, página e facetas no banco (fn_lista).
// Nunca ler relação grande inteira para filtrar no navegador — o banco corta em 1.000 linhas.
import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FiltroLista = {
  c: string;
  op: "eq" | "neq" | "in" | "nin" | "gt" | "gte" | "lt" | "lte" | "ilike" | "is_null" | "not_null" | "is_true" | "not_true" | "contains";
  v?: unknown;
};

export interface ParamsLista {
  relacao: string;
  colunas?: string[];
  busca?: string;
  filtros?: FiltroLista[];
  ordem?: { c: string; dir: "asc" | "desc" }[];
  pagina?: number;
  tamanho?: number;
  facetas?: string[];
  ids?: string[];
}

export interface ResultadoLista<T> {
  total: number;
  pagina: number;
  tamanho: number;
  linhas: T[];
  facetas: Record<string, { valor: string | null; contagem: number }[]>;
}

export function useDebounceValor<T>(valor: T, ms = 300): T {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}

/** Corpo enviado ao fn_lista: busca vazia e filtros vazios ficam fora. */
export function montarParamsLista(params: ParamsLista): Record<string, unknown> {
  const { ids, busca, ...resto } = params;
  const p: Record<string, unknown> = { ...resto };
  const b = busca?.trim();
  if (b) p.busca = b;
  const filtros = [...(params.filtros ?? [])];
  if (ids?.length) filtros.push({ c: "id", op: "in", v: ids });
  p.filtros = filtros;
  return p;
}

async function chamarLista<T>(params: ParamsLista): Promise<ResultadoLista<T>> {
  const { data, error } = await supabase.rpc("fn_lista" as never, { p: montarParamsLista(params) } as never);
  if (error) throw error;
  const r = data as unknown as ResultadoLista<T> | null;
  if (!r) throw new Error(`fn_lista não devolveu resultado para ${params.relacao}.`);
  return { total: Number(r.total ?? 0), pagina: r.pagina, tamanho: r.tamanho, linhas: r.linhas ?? [], facetas: r.facetas ?? {} };
}

export function useListaPaginada<T = Record<string, unknown>>(params: ParamsLista, opcoes?: { enabled?: boolean }) {
  const busca = useDebounceValor(params.busca ?? "", 300);
  const efetivos = { ...params, busca };
  return useQuery({
    queryKey: ["lista", params.relacao, efetivos],
    queryFn: () => chamarLista<T>(efetivos),
    placeholderData: keepPreviousData,
    enabled: opcoes?.enabled ?? true,
  });
}

/** Para pickers: 20 linhas, só dispara com 2+ caracteres ou com `ids`. */
export function useListaBusca<T = Record<string, unknown>>(params: ParamsLista) {
  const busca = useDebounceValor(params.busca ?? "", 300);
  const efetivos = { ...params, busca, tamanho: params.tamanho ?? 20 };
  const pronto = busca.trim().length >= 2 || !!params.ids?.length;
  return useQuery({
    queryKey: ["lista", params.relacao, efetivos],
    queryFn: () => chamarLista<T>(efetivos),
    placeholderData: keepPreviousData,
    enabled: pronto,
  });
}
