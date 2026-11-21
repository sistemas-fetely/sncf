import type { ParamsLista, FiltroLista, AgregadosLista } from "@/lib/lista/useListaPaginada";
import { numeroAgregado } from "@/lib/lista/useListaPaginada";
import { CARDS_OPERACIONAIS, type CardOperacional, type AlertaProduto } from "./filaOperacionalEstoque";

export interface FiltrosCentralLista {
  q: string; colecao: string[]; fase: string[]; card: string; saldo: boolean; pagina: number; tamanho: number;
}

export function parametrosCentralEstoque(f: FiltrosCentralLista): ParamsLista {
  const filtros: FiltroLista[] = [];
  if (f.colecao.length) filtros.push({ c: "colecao", op: "in", v: f.colecao });
  if (f.fase.length) filtros.push({ c: "fase", op: "in", v: f.fase });
  if (f.saldo) filtros.push({ c: "com_saldo", op: "is_true" });
  if (CARDS_OPERACIONAIS.some(c => c === f.card)) filtros.push({ c: `card_${f.card}`, op: "is_true" });
  return {
    relacao: "vw_central_estoque_produto", busca: f.q, pagina: f.pagina, tamanho: f.tamanho,
    filtros, facetas: ["colecao", "fase"],
    ordem: [{ c: "gravidade", dir: "asc" }, { c: "cobertura", dir: "asc" }, { c: "ordem_codigo", dir: "asc" }],
    agregados: [
      ...CARDS_OPERACIONAIS.map(id => ({ id, fn: "count" as const, onde: [{ c: `card_${id}`, op: "is_true" as const }], ignorar: ["*"] })),
      { id: "custo_parado", fn: "sum", c: "custo_posicao_parado", ignorar: ["*"] },
      { id: "unidades_paradas", fn: "sum", c: "unidades_paradas", ignorar: ["*"] },
    ],
  };
}

export function contagensCentralEstoque(agregados?: AgregadosLista): Record<CardOperacional, number> {
  return Object.fromEntries(CARDS_OPERACIONAIS.map(c => [c, numeroAgregado(agregados, c)])) as Record<CardOperacional, number>;
}

/** Só o pequeno subconjunto operacional; preserva a carga completa, não só a página. */
export function filtrarAlertasAcao(alertas: AlertaProduto[], f: Pick<FiltrosCentralLista, "q" | "colecao" | "fase" | "saldo">): AlertaProduto[] {
  const q = f.q.trim().toLowerCase();
  return alertas.filter(a => !!a.sku
    && (!q || [a.sku, a.cod_cadastro, a.nome_comercial].some(v => (v ?? "").toLowerCase().includes(q)))
    && (!f.colecao.length || f.colecao.includes(a.colecao ?? ""))
    && (!f.fase.length || f.fase.includes(a.fase ?? ""))
    && (!f.saldo || Number(a.saldo_rede ?? 0) > 0));
}