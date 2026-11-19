// LISTA-PAGINADA: filtro, busca, ordenação, contagem, página e facetas no banco (fn_lista).
// Nunca ler relação grande inteira para filtrar no navegador — o banco corta em 1.000 linhas.
import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FiltroLista = {
  c?: string;
  op: "eq" | "neq" | "in" | "nin" | "gt" | "gte" | "lt" | "lte" | "ilike" | "is_null" | "not_null" | "is_true" | "not_true" | "contains" | "or";
  v?: unknown;
};

export interface ParamsLista {
  relacao: string;
  agrupar?: string;
  colunas?: string[];
  busca?: string;
  filtros?: FiltroLista[];
  ordem?: { c: string; dir: "asc" | "desc"; abs?: boolean }[];
  pagina?: number;
  tamanho?: number;
  facetas?: string[];
  ids?: string[];
  agregados?: AgregadoLista[];
}

export interface AgregadoLista {
  id: string;
  fn: "sum" | "avg" | "min" | "max" | "count" | "count_distinct" | "pct";
  c?: string;
  p?: number;
  por?: (string | { c: string; trunc: "day" | "week" | "month" | "year" })[];
  onde?: FiltroLista[];
  ignorar?: string[];
}

export type GrupoAgregado = Record<string, string | number | null> & { valor: number | null };
export type AgregadosLista = Record<string, number | null | GrupoAgregado[]>;

export function numeroAgregado(agregados: AgregadosLista | undefined, id: string): number {
  const valor = agregados?.[id];
  return typeof valor === "number" ? valor : 0;
}

export function gruposAgregado(agregados: AgregadosLista | undefined, id: string): GrupoAgregado[] {
  const valor = agregados?.[id];
  return Array.isArray(valor) ? valor : [];
}

export interface ResultadoLista<T> {
  total: number;
  pagina: number;
  tamanho: number;
  linhas: T[];
  facetas: Record<string, { valor: string | null; contagem: number }[]>;
  agregados: AgregadosLista;
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
  const filtros = [...(params.filtros ?? [])].map(f => {
    // fn_lista compara eq como texto; preserve microssegundos e o fuso da foto.
    if (params.relacao === "xpm_estoque_posicao" && f.c === "data_hora_posicao" && f.op === "eq" && typeof f.v === "string") {
      return { ...f, v: f.v.replace("T", " ").replace(/([+-]\d{2}):00$/, "$1") };
    }
    return f;
  });
  if (ids?.length) filtros.push({ c: "id", op: "in", v: ids });
  p.filtros = filtros;
  return p;
}

async function chamarLista<T>(params: ParamsLista): Promise<ResultadoLista<T>> {
  const { data, error } = await supabase.rpc("fn_lista" as never, { p: montarParamsLista(params) } as never);
  if (error) throw error;
  const r = data as unknown as ResultadoLista<T> | null;
  if (!r) throw new Error(`fn_lista não devolveu resultado para ${params.relacao}.`);
  return { total: Number(r.total ?? 0), pagina: r.pagina, tamanho: r.tamanho, linhas: r.linhas ?? [], facetas: r.facetas ?? {}, agregados: r.agregados ?? {} };
}

/** Exporta todo o recorte pela mesma RPC, nunca pela relação direta. */
export async function exportarLista<T>(params: ParamsLista): Promise<T[]> {
  const linhas: T[] = [];
  for (let pagina = 1; ; pagina += 1) {
    const resultado = await chamarLista<T>({ ...params, pagina, tamanho: 500 });
    linhas.push(...resultado.linhas);
    if (params.agrupar ? pagina * 500 >= resultado.total : linhas.length >= resultado.total) return linhas;
    if (!resultado.linhas.length) throw new Error(`fn_lista interrompeu a exportação de ${params.relacao} antes do total.`);
  }
}

export function useListaPaginada<T = Record<string, unknown>>(params: ParamsLista, opcoes?: { enabled?: boolean; refetchInterval?: number; refetchOnWindowFocus?: boolean; debounceMs?: number }) {
  const buscaDebounce = useDebounceValor(params.busca ?? "", opcoes?.debounceMs ?? 300);
  const busca = opcoes?.debounceMs === 0 ? params.busca ?? "" : buscaDebounce;
  const efetivos = { ...params, busca };
  return useQuery({
    queryKey: ["lista", params.relacao, efetivos],
    queryFn: () => chamarLista<T>(efetivos),
    placeholderData: keepPreviousData,
    enabled: opcoes?.enabled ?? true,
    refetchInterval: opcoes?.refetchInterval,
    refetchOnWindowFocus: opcoes?.refetchOnWindowFocus ?? true,
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
