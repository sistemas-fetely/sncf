import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Erro de acesso (42501) — a tela troca tudo por um aviso. */
export class SemAcessoIC extends Error {}

export async function chamarRpc<T = Record<string, unknown>>(nome: string, args: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await (supabase as any).rpc(nome, args);
  if (error) {
    if (error.code === "42501") throw new SemAcessoIC(error.message);
    throw new Error(error.message);
  }
  return (data ?? []) as T[];
}

export const n = (v: unknown): number => (v === null || v === undefined || v === "" ? 0 : Number(v) || 0);
export const nOuNull = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

export type StatusGiro = "Repor" | "Saudável" | "Lento" | "Parado" | "Novo";

export interface LinhaGiro {
  categoria: string | null;
  colecao: string | null;
  variante: string | null;
  sku: string | null;
  nome: string | null;
  numero: string | null;
  skus: number;
  disponivel: number;
  entrada: number;
  vendido: number;
  saldo: number;
  receita: number;
  estoque_custo: number;
  venda_mes: number;
  cobertura_meses: number | null;
  sell_through: number | null;
  giro_ano: number | null;
  tendencia_30d: number | null;
  dias_venda: number;
  status: StatusGiro | null;
}

function normGiro(r: any): LinhaGiro {
  return {
    categoria: r.categoria ?? null,
    colecao: r.colecao ?? null,
    variante: r.variante ?? null,
    sku: r.sku ?? null,
    nome: r.nome ?? null,
    numero: r.numero == null ? null : String(r.numero),
    skus: n(r.skus),
    disponivel: n(r.disponivel),
    entrada: n(r.entrada),
    vendido: n(r.vendido),
    saldo: n(r.saldo),
    receita: n(r.receita),
    estoque_custo: n(r.estoque_custo),
    venda_mes: n(r.venda_mes),
    cobertura_meses: nOuNull(r.cobertura_meses),
    sell_through: nOuNull(r.sell_through),
    giro_ano: nOuNull(r.giro_ano),
    tendencia_30d: nOuNull(r.tendencia_30d),
    dias_venda: n(r.dias_venda),
    status: r.status ?? null,
  };
}

export function useGiro(ini: string | null, fim: string | null, nivel: string, enabled = true) {
  return useQuery({
    queryKey: ["ic_rpc_giro", ini, fim, nivel],
    enabled,
    queryFn: async () => (await chamarRpc("ic_rpc_giro", { p_ini: ini, p_fim: fim, p_nivel: nivel })).map(normGiro),
    retry: (c, e) => !(e instanceof SemAcessoIC) && c < 2,
  });
}

export interface LinhaMensal { mes: string; serie: string; receita: number; unidades: number }

export function useGiroMensal(ini: string | null, fim: string | null, cat: string | null, col: string | null, vari: string | null) {
  return useQuery({
    queryKey: ["ic_rpc_giro_mensal", ini, fim, cat, col, vari],
    queryFn: async (): Promise<LinhaMensal[]> =>
      (await chamarRpc<any>("ic_rpc_giro_mensal", { p_ini: ini, p_fim: fim, p_categoria: cat, p_colecao: col, p_variante: vari }))
        .map((r) => ({ mes: String(r.mes), serie: String(r.serie ?? "—"), receita: n(r.receita), unidades: n(r.unidades) })),
    retry: (c, e) => !(e instanceof SemAcessoIC) && c < 2,
  });
}

export interface Opcao { categoria: string; categoria_ordem: number; colecao: string; variante: string | null; sku: string; numero: string | null }

export function useOpcoes() {
  return useQuery({
    queryKey: ["ic_rpc_opcoes"],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Opcao[]> =>
      (await chamarRpc<any>("ic_rpc_opcoes", {})).map((r) => ({
        categoria: String(r.categoria ?? "—"),
        categoria_ordem: n(r.categoria_ordem),
        colecao: String(r.colecao ?? "—"),
        variante: r.variante ?? null,
        sku: String(r.sku),
        numero: r.numero == null ? null : String(r.numero),
      })),
    retry: (c, e) => !(e instanceof SemAcessoIC) && c < 2,
  });
}

export interface LinhaRanking {
  posicao: number; chave: string; nome: string | null; documento: string | null; tipo_pessoa: string | null;
  uf: string | null; cidade: string | null; faturado: number; unidades: number; nfs: number;
  ticket_medio: number; pct_total: number; ultima_compra: string | null; colecoes: number | null;
}

export interface FiltroRanking {
  dimensao: "cliente" | "uf" | "colecao";
  categorias: string[] | null; colecoes: string[] | null; skus: string[] | null;
  tipo: string | null; documento: string | null;
}

export function useRanking(ini: string | null, fim: string | null, f: FiltroRanking, enabled = true) {
  return useQuery({
    queryKey: ["ic_rpc_ranking_vendas", ini, fim, f],
    enabled,
    queryFn: async (): Promise<LinhaRanking[]> =>
      (await chamarRpc<any>("ic_rpc_ranking_vendas", {
        p_ini: ini, p_fim: fim, p_dimensao: f.dimensao,
        p_categorias: f.categorias, p_colecoes: f.colecoes, p_skus: f.skus,
        p_tipo_pessoa: f.tipo, p_documento: f.documento,
      })).map((r) => ({
        posicao: n(r.posicao), chave: String(r.chave ?? ""), nome: r.nome ?? null, documento: r.documento ?? null,
        tipo_pessoa: r.tipo_pessoa ?? null, uf: r.uf ?? null, cidade: r.cidade ?? null,
        faturado: n(r.faturado), unidades: n(r.unidades), nfs: n(r.nfs), ticket_medio: n(r.ticket_medio),
        pct_total: n(r.pct_total), ultima_compra: r.ultima_compra ?? null, colecoes: nOuNull(r.colecoes),
      })),
    retry: (c, e) => !(e instanceof SemAcessoIC) && c < 2,
  });
}

/* ---------- formatação ---------- */
export const fmtInt = (v: number) => Math.round(v).toLocaleString("pt-BR");
export const fmtMeses = (v: number | null) => (v === null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
export const fmtX = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}×`);
export const fmtPct = (v: number | null, casas = 0) => (v === null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: casas })}%`);

export const STATUS_COR: Record<StatusGiro, string> = {
  Repor: "hsl(var(--success))",
  Saudável: "hsl(var(--info))",
  Lento: "hsl(var(--warning))",
  Parado: "hsl(var(--destructive))",
  Novo: "hsl(var(--muted-foreground))",
};
export const STATUS_BADGE: Record<StatusGiro, string> = {
  Repor: "bg-success/15 text-success border-success/30",
  Saudável: "bg-info/15 text-info border-info/30",
  Lento: "bg-warning/15 text-warning border-warning/30",
  Parado: "bg-destructive/15 text-destructive border-destructive/30",
  Novo: "bg-muted text-muted-foreground border-border",
};

export const PALETA_SERIES = [
  "hsl(var(--primary))", "hsl(var(--info))", "hsl(var(--success))", "hsl(var(--warning))",
  "hsl(var(--destructive))", "hsl(var(--muted-foreground))", "hsl(var(--accent-foreground))",
];

/* ---------- período ---------- */
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function atalhoPeriodo(tipo: "todo" | "mes" | "mes_passado" | "90", hoje = new Date()): { ini: string; fim: string } {
  if (tipo === "todo") return { ini: "", fim: "" };
  if (tipo === "mes") return { ini: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), fim: iso(hoje) };
  if (tipo === "mes_passado")
    return { ini: iso(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)), fim: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 0)) };
  const d = new Date(hoje); d.setDate(d.getDate() - 89);
  return { ini: iso(d), fim: iso(hoje) };
}
export const mesCorrente = (hoje = new Date()) => `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

export const lista = (s: string): string[] => (s ? s.split("|").filter(Boolean) : []);
export const juntar = (a: string[]) => a.join("|");
