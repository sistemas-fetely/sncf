import type { Database } from "@/integrations/supabase/types";
import { FILA, noCard, type ProdutoCentral } from "./centralEstoque";
import type { ReposicaoSp, CargaReposicao } from "./reposicaoSp";

export type AlertaProduto = Database["public"]["Views"]["vw_estoque_alerta_produto"]["Row"];
export const CARDS_OPERACIONAIS = ["repor", ...FILA, "parado_xpm", "devolucao_alta", "sem_giro"] as const;
export type CardOperacional = typeof CARDS_OPERACIONAIS[number];
export const ROTULOS_FILA: Record<CardOperacional, string> = {
  repor: "Repor SP", acabando: "Acabando", zerado_venda: "Zerado com venda", retido: "Retido em canal",
  diverge: "Diverge do real", sem_contagem: "Sem contagem", a_caminho: "A caminho",
  parado_xpm: "Parado na XPM", devolucao_alta: "Devolução alta", sem_giro: "Sem giro",
};
export function montarFilaOperacional(produtos: ProdutoCentral[], reposicao: ReposicaoSp[], alertas: AlertaProduto[]) {
  const skus = Object.fromEntries(CARDS_OPERACIONAIS.map(c => [c, new Set<string>()])) as Record<CardOperacional, Set<string>>;
  for (const p of produtos) for (const c of FILA) if (p.principais.some(l => noCard(l, c))) skus[c].add(p.sku);
  for (const r of reposicao) if (r.ritmo != null) skus.repor.add(r.sku);
  let custoPosicao = 0, unidadesParadas = 0;
  for (const a of alertas) {
    if (!a.sku) continue;
    if (a.parado_xpm) { skus.parado_xpm.add(a.sku); custoPosicao += Number(a.custo_posicao_mes ?? 0); }
    if (a.devolucao_alta) skus.devolucao_alta.add(a.sku);
    if (a.sem_giro) { skus.sem_giro.add(a.sku); unidadesParadas += Number(a.saldo_rede ?? 0); }
  }
  return { skus, custoPosicao, unidadesParadas,
    urgente: reposicao.filter(r => r.ritmo === "urgente").length,
    carga: reposicao.filter(r => r.ritmo === "carga").length };
}
export function skusDoCard(fila: ReturnType<typeof montarFilaOperacional>, card: string): Set<string> | null {
  return CARDS_OPERACIONAIS.includes(card as CardOperacional) ? fila.skus[card as CardOperacional] : null;
}
export function cargaParadosXpm(alertas: AlertaProduto[]): CargaReposicao | null {
  const itens = alertas.filter(a => a.parado_xpm && a.sku && Number(a.disp_xpm) > 0)
    .map(a => ({ sku: a.sku ?? "", nome: a.nome_comercial ?? "", quantidade: Number(a.disp_xpm) }));
  return itens.length ? { aba: "carga", itens } : null;
}
// A tela de devoluções busca SKU/nome, não cod_cadastro. Incluir encerradas.
export const urlDevolucoesProduto = (sku: string) => `/devolucoes?fin=1&q=${encodeURIComponent(sku)}`;