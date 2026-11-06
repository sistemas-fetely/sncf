/**
 * CENTRAL DE ESTOQUE (ESTOQUE v6 F2) — regras puras da tela: agrupar as linhas
 * de `vw_central_estoque` por produto, cards da fila e ordem por gravidade.
 * Nada aqui decide estoque: status, piso e cobertura vêm prontos do banco.
 */
export type StatusCentro = "retido" | "zerado" | "acabando" | "ok";
export type PapelCentro = "mae" | "avancado" | "complemento" | "terceiro" | string;

export interface RegraCanal { piso_un: number | null; piso_dias: number | null; redireciona_para: string | null }
export interface RetencaoCanal { canal: string; motivo: string; desde: string }

export interface LinhaCentral {
  cod_cadastro: string | null; sku: string; nome_comercial: string | null; cor_nome: string | null;
  colecao: string | null; fase: string | null; centro: string; centro_rotulo: string | null;
  centro_ordem: number | null; papel: PapelCentro; papel_rotulo: string | null; conta_na_rede: boolean | null;
  regua: string | null; compoe_falta: boolean | null; contabil: number | null; vendavel: number | null;
  bloqueado: number | null; reservado: number | null; disponivel: number | null; a_caminho: number | null;
  real_centro: number | null; contagem_em: string | null; dias_desde_contagem: number | null; furo: number | null;
  demanda_dia: number | null; piso_un: number | null; piso_dias: number | null;
  regras: Record<string, RegraCanal> | null; retencoes: RetencaoCanal[] | null;
  cobertura_dias: number | null; status: StatusCentro | null; diverge_real: boolean | null;
}

export interface ProdutoCentral {
  sku: string; cod_cadastro: string | null; nome: string | null; cor: string | null;
  colecao: string | null; fase: string | null;
  centros: Record<string, LinhaCentral>;
  principais: LinhaCentral[]; terceiros: LinhaCentral[];
  rede: number; terceirosDisp: number; gravidade: number; cobertura: number | null;
}

export interface CentroColuna { codigo: string; rotulo: string; ordem: number; papel: PapelCentro }

export const ePrincipal = (p: PapelCentro) => p === "mae" || p === "avancado" || p === "complemento";
const n = (v: number | null | undefined) => Number(v ?? 0);

/** Gravidade da célula: 0 retido · 1 zerado com venda · 2 acabando · 3 zerado parado · 4 ok. */
export function gravidade(l: LinhaCentral): number {
  if (l.status === "retido") return 0;
  if (l.status === "zerado") return n(l.demanda_dia) > 0 ? 1 : 3;
  if (l.status === "acabando") return 2;
  return 4;
}

export const FILA = ["acabando", "zerado_venda", "retido", "diverge", "sem_contagem", "a_caminho"] as const;
export type CardFila = (typeof FILA)[number];

export function noCard(l: LinhaCentral, card: CardFila): boolean {
  if (!ePrincipal(l.papel)) return false;
  switch (card) {
    case "acabando": return l.status === "acabando";
    case "zerado_venda": return l.status === "zerado" && n(l.demanda_dia) > 0;
    case "retido": return l.status === "retido";
    case "diverge": return l.diverge_real === true;
    case "sem_contagem": return l.papel !== "mae" && (l.contagem_em == null || n(l.dias_desde_contagem) > 90);
    case "a_caminho": return n(l.a_caminho) > 0;
  }
}

export function agrupar(linhas: LinhaCentral[]): { produtos: ProdutoCentral[]; colunas: CentroColuna[] } {
  const cols = new Map<string, CentroColuna>();
  const mapa = new Map<string, ProdutoCentral>();
  for (const l of linhas) {
    if (ePrincipal(l.papel) && !cols.has(l.centro))
      cols.set(l.centro, { codigo: l.centro, rotulo: l.centro_rotulo ?? l.centro, ordem: n(l.centro_ordem), papel: l.papel });
    let p = mapa.get(l.sku);
    if (!p) {
      p = { sku: l.sku, cod_cadastro: l.cod_cadastro, nome: l.nome_comercial, cor: l.cor_nome, colecao: l.colecao, fase: l.fase,
        centros: {}, principais: [], terceiros: [], rede: 0, terceirosDisp: 0, gravidade: 4, cobertura: null };
      mapa.set(l.sku, p);
    }
    p.centros[l.centro] = l;
    if (ePrincipal(l.papel)) {
      p.principais.push(l);
      p.gravidade = Math.min(p.gravidade, gravidade(l));
      if (l.cobertura_dias != null) p.cobertura = p.cobertura == null ? n(l.cobertura_dias) : Math.min(p.cobertura, n(l.cobertura_dias));
    } else if (l.papel === "terceiro") {
      p.terceiros.push(l);
      p.terceirosDisp += n(l.disponivel);
    }
    if (l.conta_na_rede) p.rede += n(l.disponivel);
  }
  const produtos = [...mapa.values()].sort(ordenar);
  return { produtos, colunas: [...cols.values()].sort((a, b) => a.ordem - b.ordem) };
}

/** Status mais grave primeiro; depois menor cobertura (sem cobertura vai ao fim); depois código. */
export function ordenar(a: ProdutoCentral, b: ProdutoCentral): number {
  if (a.gravidade !== b.gravidade) return a.gravidade - b.gravidade;
  const ca = a.cobertura ?? Infinity, cb = b.cobertura ?? Infinity;
  if (ca !== cb) return ca - cb;
  return (a.cod_cadastro ?? a.sku).localeCompare(b.cod_cadastro ?? b.sku);
}

export interface FiltroCentral { q: string; colecao: string; fase: string; card: string; comSaldo: boolean }

export function filtrar(ps: ProdutoCentral[], f: FiltroCentral): ProdutoCentral[] {
  const q = f.q.trim().toLowerCase();
  return ps.filter((p) => {
    if (q && ![p.sku, p.cod_cadastro, p.nome].some((v) => (v ?? "").toLowerCase().includes(q))) return false;
    if (f.colecao && p.colecao !== f.colecao) return false;
    if (f.fase && p.fase !== f.fase) return false;
    if (f.comSaldo && p.rede <= 0) return false;
    if (f.card && !p.principais.some((l) => noCard(l, f.card as CardFila))) return false;
    return true;
  });
}

export function contarFila(ps: ProdutoCentral[]): Record<CardFila, number> {
  const out = Object.fromEntries(FILA.map((c) => [c, 0])) as Record<CardFila, number>;
  for (const p of ps) for (const c of FILA) if (p.principais.some((l) => noCard(l, c))) out[c]++;
  return out;
}
