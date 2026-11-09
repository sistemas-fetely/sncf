import type { ItemReposicao, ReposicaoSp } from "./reposicaoSp";
import type { OrdemKD } from "@/lib/navegacao/codecUrl";

export type LinhaReposicaoTabela = ReposicaoSp & { colecao: string | null; familia: string | null; grupo: string | null };
export type SelecaoReposicao = Record<string, { marcado: boolean; qtd: number }>;
export type FiltrosReposicao = { busca: string; colecoes: string[]; familias: string[]; grupos: string[]; classes: string[]; situacoes: string[] };
export const semCategoria = "__sem__";
const normalizar = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
export const estadoSelecao = (l: ReposicaoSp, selecao: SelecaoReposicao) => selecao[l.sku] ?? { marcado: true, qtd: l.qtd_sugerida ?? 0 };
export function filtrarReposicao(linhas: LinhaReposicaoTabela[], f: FiltrosReposicao) {
  const busca = normalizar(f.busca);
  const inclui = (valores: string[], valor: string | null) => !valores.length || valores.includes(valor || semCategoria);
  return linhas.filter(l => (!busca || normalizar(`${l.cod_cadastro ?? ""} ${l.sku} ${l.nome_comercial ?? ""}`).includes(busca))
    && inclui(f.colecoes, l.colecao) && inclui(f.familias, l.familia) && inclui(f.grupos, l.grupo)
    && inclui(f.classes, l.classe) && inclui(f.situacoes, l.situacao));
}
export function ordenarReposicao(linhas: LinhaReposicaoTabela[], ordem: OrdemKD, selecao: SelecaoReposicao) {
  if (!ordem) return linhas;
  const valor = (l: LinhaReposicaoTabela): string | number | null => {
    if (ordem.key === "quantidade") return estadoSelecao(l, selecao).qtd;
    if (ordem.key === "classe") return l.classe_rotulo ?? l.classe;
    const v = l[ordem.key as keyof LinhaReposicaoTabela];
    return typeof v === "string" || typeof v === "number" ? v : null;
  };
  return [...linhas].sort((a, b) => {
    const va = valor(a), vb = valor(b);
    if (va === null) return vb === null ? 0 : 1;
    if (vb === null) return -1;
    const compara = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR", { numeric: true, sensitivity: "base" });
    return compara * (ordem.dir === "asc" ? 1 : -1) || (ordem.key === "minimo" ? ((a.teto ?? 0) - (b.teto ?? 0)) * (ordem.dir === "asc" ? 1 : -1) : 0);
  });
}
export function agruparReposicao(linhas: LinhaReposicaoTabela[]) {
  const grupos = new Map<string, LinhaReposicaoTabela[]>();
  for (const l of linhas) { const nome = l.colecao || "Sem coleção"; grupos.set(nome, [...(grupos.get(nome) ?? []), l]); }
  return [...grupos].map(([nome, produtos]) => ({ nome, produtos, unidades: produtos.reduce((s, l) => s + (l.qtd_sugerida ?? 0), 0) }));
}
export function marcarReposicao(selecao: SelecaoReposicao, linhas: ReposicaoSp[], marcado: boolean): SelecaoReposicao {
  return { ...selecao, ...Object.fromEntries(linhas.map(l => [l.sku, { ...estadoSelecao(l, selecao), marcado }])) };
}
export function checkboxReposicao(linhas: ReposicaoSp[], selecao: SelecaoReposicao): boolean | "indeterminate" {
  const n = linhas.filter(l => estadoSelecao(l, selecao).marcado).length;
  return n === 0 ? false : n === linhas.length ? true : "indeterminate";
}
export function itensSelecionadosReposicao(linhas: ReposicaoSp[], selecao: SelecaoReposicao): ItemReposicao[] {
  return linhas.filter(l => estadoSelecao(l, selecao).marcado && estadoSelecao(l, selecao).qtd > 0)
    .map(l => ({ sku: l.sku, nome: l.nome_comercial ?? "", quantidade: estadoSelecao(l, selecao).qtd }));
}