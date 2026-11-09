import type { Database } from "@/integrations/supabase/types";
import { colecaoNaoCadastrada, type ColecaoDim } from './colecoesCatalogo';

export type CelulaCatalogo = Database['public']['Tables']['catalogo_planilha_mudanca']['Row'];
export const CAMPOS_OPERACOES = ['ncm', 'cest', 'origem_fisc', 'origem_prod'];
export type ProdutoRevisao = { codigo: string; nome: string; celulas: CelulaCatalogo[] };
export type EscolhasCatalogo = Record<string, 'planilha' | 'sistema'>;
export type DecisaoCatalogo = { ids: string[]; acao: 'aplicar' | 'descartar' | 'resolver'; escolha: 'planilha' | 'sistema'; dono?: DonoCatalogo };
export type DonoCatalogo = 'operacoes' | 'produto';
export type FiltroCatalogo = { campo: string; tipo: string; busca: string; bloco?: string; dono?: string; natureza?: string; fase?: string; colecoes?: string; linhas?: string };
const DONOS = ['operacoes', 'produto'];

export function valorSistemaVazio(valor: unknown): boolean {
  return valor == null || (typeof valor === 'string' && valor.trim() === '');
}

export function completarNomesCatalogo(nomes: Record<string, string>, celulas: Pick<CelulaCatalogo, 'cod_cadastro' | 'campo' | 'valor_planilha'>[]): Record<string, string> {
  const out = { ...nomes };
  for (const c of celulas) {
    if (c.campo === 'nome_comercial' && !out[c.cod_cadastro]?.trim() && typeof c.valor_planilha === 'string' && c.valor_planilha.trim()) out[c.cod_cadastro] = `${c.valor_planilha} (planilha)`;
  }
  return out;
}

export type InfoProdutoCatalogo = { colecao: string | null; linha: string | null; fase: string | null };
export type NaturezaCatalogo = 'preencher' | 'alterar';
/** Filled empty system value vs. replacing an existing one. */
export const naturezaCelula = (c: Pick<CelulaCatalogo, 'valor_sistema'>): NaturezaCatalogo => valorSistemaVazio(c.valor_sistema) ? 'preencher' : 'alterar';
const SEP = '|';
export const listaFiltro = (v: string | undefined) => (v ? v.split(SEP).filter(Boolean) : []);
export const juntarFiltro = (v: string[]) => v.join(SEP);
export type DimensaoCatalogo = 'bloco' | 'dono' | 'natureza' | 'fase' | 'colecoes' | 'linhas' | 'campo' | 'tipo';
type Ctx = { nomes: Record<string, string>; blocoDe?: Record<string, string>; info?: Record<string, InfoProdutoCatalogo> };
const SEM = '(sem)';
export function valorDimensao(c: CelulaCatalogo, d: DimensaoCatalogo, ctx: Ctx): string {
  const i = ctx.info?.[c.cod_cadastro];
  switch (d) {
    case 'bloco': return ctx.blocoDe?.[c.campo] ?? SEM;
    case 'dono': return c.dono;
    case 'natureza': return naturezaCelula(c);
    case 'fase': return i?.fase || SEM;
    case 'colecoes': return i?.colecao || SEM;
    case 'linhas': return i?.linha || SEM;
    case 'campo': return c.campo;
    case 'tipo': return c.tipo;
  }
}

/** Visible pending cells for the filter; `ignorar` skips one dimension (used to count that dimension's options). */
export function filtrarCelulas(celulas: CelulaCatalogo[], filtro: FiltroCatalogo, ctx: Ctx, ignorar?: DimensaoCatalogo): CelulaCatalogo[] {
  const busca = filtro.busca.trim().toLocaleLowerCase('pt-BR');
  const simples: [DimensaoCatalogo, string | undefined][] = [['bloco', filtro.bloco], ['dono', filtro.dono], ['natureza', filtro.natureza], ['fase', filtro.fase], ['campo', filtro.campo], ['tipo', filtro.tipo]];
  const multi: [DimensaoCatalogo, string[]][] = [['colecoes', listaFiltro(filtro.colecoes)], ['linhas', listaFiltro(filtro.linhas)]];
  return celulas.filter(c => {
    if (!DONOS.includes(c.dono) || !['mudanca', 'conflito', 'erro'].includes(c.tipo)) return false;
    for (const [d, v] of simples) if (d !== ignorar && v && v !== 'todos' && valorDimensao(c, d, ctx) !== v) return false;
    for (const [d, v] of multi) if (d !== ignorar && v.length && !v.includes(valorDimensao(c, d, ctx))) return false;
    if (busca && !`${c.cod_cadastro} ${ctx.nomes[c.cod_cadastro] ?? ''}`.toLocaleLowerCase('pt-BR').includes(busca)) return false;
    return true;
  });
}

/** Products and cells per option of one dimension, honoring every other active filter. */
export function contarOpcoes(celulas: CelulaCatalogo[], filtro: FiltroCatalogo, ctx: Ctx, d: DimensaoCatalogo): Record<string, { produtos: number; celulas: number }> {
  const out: Record<string, { produtos: number; celulas: number; cods: Set<string> }> = {};
  for (const c of filtrarCelulas(celulas, filtro, ctx, d)) {
    const v = valorDimensao(c, d, ctx);
    const o = out[v] ??= { produtos: 0, celulas: 0, cods: new Set() };
    o.celulas++; o.cods.add(c.cod_cadastro); o.produtos = o.cods.size;
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { produtos: v.produtos, celulas: v.celulas }]));
}

export function agruparCatalogo(celulas: CelulaCatalogo[], nomes: Record<string, string>, filtro: FiltroCatalogo, blocoDe: Record<string, string> = {}, info?: Record<string, InfoProdutoCatalogo>): ProdutoRevisao[] {
  const grupos = new Map<string, ProdutoRevisao>();
  for (const c of filtrarCelulas(celulas, filtro, { nomes, blocoDe, info })) {
    const grupo = grupos.get(c.cod_cadastro) ?? { codigo: c.cod_cadastro, nome: nomes[c.cod_cadastro] ?? '', celulas: [] };
    grupo.celulas.push(c);
    grupos.set(c.cod_cadastro, grupo);
  }
  return [...grupos.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
}

export const celulaSelecionavel = (c: CelulaCatalogo, colecoes?: ColecaoDim[]) => ['mudanca', 'conflito'].includes(c.tipo) && (colecoes === undefined || !colecaoNaoCadastrada(c, colecoes));

/** Footer summary of a cell selection. */
export function resumoSelecao(celulas: CelulaCatalogo[]) {
  return { produtos: new Set(celulas.map(c => c.cod_cadastro)).size, celulas: celulas.length, operacoes: celulas.filter(c => c.dono === 'operacoes').length, produto: celulas.filter(c => c.dono === 'produto').length };
}

export function celulasSelecionadas(produtos: ProdutoRevisao[], selecionados: Set<string>) {
  return produtos.filter(p => selecionados.has(p.codigo)).flatMap(p => p.celulas).filter(c => ['mudanca', 'conflito'].includes(c.tipo));
}

export function decisoesCatalogo(celulas: CelulaCatalogo[], acao: 'aplicar' | 'descartar', escolhas: EscolhasCatalogo): DecisaoCatalogo[] {
  const elegiveis = celulas.filter(c => ['mudanca', 'conflito'].includes(c.tipo));
  if (acao === 'descartar') return elegiveis.length ? [{ ids: elegiveis.map(c => c.id), acao, escolha: 'sistema' }] : [];
  if (elegiveis.some(c => c.tipo === 'conflito' && !escolhas[c.id])) return [];
  const grupos: DecisaoCatalogo[] = [];
  const simples = elegiveis.filter(c => c.tipo === 'mudanca');
  if (simples.length) grupos.push({ ids: simples.map(c => c.id), acao: 'aplicar', escolha: 'planilha' });
  for (const escolha of ['planilha', 'sistema'] as const) {
    const conflitos = elegiveis.filter(c => c.tipo === 'conflito' && escolhas[c.id] === escolha);
    if (conflitos.length) grupos.push({ ids: conflitos.map(c => c.id), acao: 'resolver', escolha });
  }
  return grupos;
}

/** Pending cells per matrix block (both owners), for the header totals. */
export function totaisPorBloco(celulas: CelulaCatalogo[], blocoDe: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of celulas) {
    if (!DONOS.includes(c.dono) || c.status !== 'pendente' || !['mudanca', 'conflito', 'erro'].includes(c.tipo)) continue;
    const b = blocoDe[c.campo] ?? 'sem_bloco';
    out[b] = (out[b] ?? 0) + 1;
  }
  return out;
}

export type PlanoCatalogo = { sncf: DecisaoCatalogo[]; fop: string[] };

/**
 * Splits selected cells (Mapa v2). Both owners (operacoes/fiscal and produto): mudança and conflict "planilha" go to the FOP; conflict "sistema" and discards never call the FOP.
 * Returns an empty plan while any selected conflict lacks a choice.
 */
export function planoCatalogo(celulas: CelulaCatalogo[], acao: 'aplicar' | 'descartar', escolhas: EscolhasCatalogo): PlanoCatalogo {
  const elegiveis = celulas.filter(c => DONOS.includes(c.dono) && ['mudanca', 'conflito'].includes(c.tipo));
  if (acao === 'aplicar' && elegiveis.some(c => c.tipo === 'conflito' && !escolhas[c.id])) return { sncf: [], fop: [] };
  // Mapa v2: both owners are written by the FOP (its mirror overwrote fiscal fields written in sncf_produtos);
  // discard and conflict→"sistema" never call the FOP and resolve directly per owner.
  const sncf: DecisaoCatalogo[] = [];
  for (const dono of ['operacoes', 'produto'] as const) {
    const doDono = elegiveis.filter(c => c.dono === dono);
    const ids = (acao === 'descartar' ? doDono : doDono.filter(c => c.tipo === 'conflito' && escolhas[c.id] === 'sistema')).map(c => c.id);
    if (ids.length) sncf.push({ ids, acao: acao === 'descartar' ? 'descartar' : 'resolver', escolha: 'sistema', dono });
  }
  if (acao === 'descartar') return { sncf, fop: [] };
  const fop = elegiveis.filter(c => c.tipo === 'mudanca' || escolhas[c.id] === 'planilha').map(c => c.id);
  return { sncf, fop };
}
