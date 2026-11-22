import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Linha de `vw_processo_tarefa` (só leitura): tarefa do motor ligada ao seu caso. */
export interface ProcessoTarefa {
  tarefa_id: string;
  processo_codigo: string | null;
  processo_nome: string | null;
  passo_codigo: string | null;
  passo_nome: string | null;
  passo_ordem: number | null;
  area_nome: string | null;
  caso_tipo: "devolucao" | "rastreio" | "rastreio_nf" | string;
  caso_id: string | null;
  pedido_id: string | null;
  caso_ref: string | null;
  status: string | null;
  prazo_data: string | null;
  aberta: boolean | null;
  atrasada: boolean | null;
  regra_prazo_codigo: string | null;
  aberta_em: string | null;
  fechada_em: string | null;
  fechada_por: string | null;
}

export const KEY_PROCESSO_TAREFA = ["processos", "vw_processo_tarefa"] as const;

/** Uma única consulta à view por tela; Map por tarefa_id. */
export function useProcessoTarefas() {
  return useQuery({
    queryKey: KEY_PROCESSO_TAREFA,
    queryFn: async (): Promise<Map<string, ProcessoTarefa>> => {
      const { data, error } = await supabase.from("vw_processo_tarefa" as never).select("*");
      if (error) throw error;
      const m = new Map<string, ProcessoTarefa>();
      for (const r of (data ?? []) as unknown as ProcessoTarefa[]) m.set(r.tarefa_id, r);
      return m;
    },
  });
}

/** Tarefas abertas agrupadas por caso (chave `${caso_tipo}:${caso_id}` e `${caso_tipo}:ref:${caso_ref}`). */
export function agruparAbertasPorCaso(mapa: Map<string, ProcessoTarefa> | undefined) {
  const g = new Map<string, ProcessoTarefa[]>();
  if (!mapa) return g;
  const add = (k: string, r: ProcessoTarefa) => { const l = g.get(k) ?? []; l.push(r); g.set(k, l); };
  for (const r of mapa.values()) {
    if (!r.aberta) continue;
    if (r.caso_id) add(`${r.caso_tipo}:${r.caso_id}`, r);
    if (r.caso_ref) add(`${r.caso_tipo}:ref:${r.caso_ref.trim().toLowerCase()}`, r);
  }
  for (const l of g.values()) l.sort((a, b) => (a.passo_ordem ?? 0) - (b.passo_ordem ?? 0));
  return g;
}

export const fmtPrazoCurto = (d: string | null) => (d ? d.slice(5, 10).split("-").reverse().join("/") : "—");

/** Link para o caso, usando os parâmetros de URL já existentes das telas. */
export function linkDoCaso(r: ProcessoTarefa): string | null {
  if (r.caso_tipo === "devolucao" && r.caso_id) return `/devolucoes?detalhe=${encodeURIComponent(r.caso_id)}${r.caso_ref ? `&q=${encodeURIComponent(r.caso_ref)}` : ""}`;
  if ((r.caso_tipo === "rastreio" || r.caso_tipo === "rastreio_nf") && r.caso_ref) return `/logistica?aba=entregas&and_busca=${encodeURIComponent(r.caso_ref)}`;
  return null;
}

/**
 * Tarefas abertas de rastreio indexadas por pedido_id (as linhas de Entregas não trazem
 * o id nem o código do rastreamento). O vínculo por pedido vem da própria view.
 */
export function useProcessoRastreioPorPedido() {
  const procQ = useProcessoTarefas();
  return useMemo(() => {
    const m = new Map<string, ProcessoTarefa[]>();
    for (const p of procQ.data?.values() ?? []) {
      if (!p.aberta || !p.pedido_id || (p.caso_tipo !== "rastreio" && p.caso_tipo !== "rastreio_nf")) continue;
      m.set(p.pedido_id, [...(m.get(p.pedido_id) ?? []), p]);
    }
    return m;
  }, [procQ.data]);
}
