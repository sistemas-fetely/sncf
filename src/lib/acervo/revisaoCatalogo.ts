import type { Database } from "@/integrations/supabase/types";

export type CelulaCatalogo = Database['public']['Tables']['catalogo_planilha_mudanca']['Row'];
export const CAMPOS_OPERACOES = ['ncm', 'cest', 'origem_fisc', 'origem_prod'];
export type ProdutoRevisao = { codigo: string; nome: string; celulas: CelulaCatalogo[] };
export type EscolhasCatalogo = Record<string, 'planilha' | 'sistema'>;
export type DecisaoCatalogo = { ids: string[]; acao: 'aplicar' | 'descartar' | 'resolver'; escolha: 'planilha' | 'sistema'; dono?: DonoCatalogo };
export type DonoCatalogo = 'operacoes' | 'produto';
export type FiltroCatalogo = { campo: string; tipo: string; busca: string; bloco?: string };
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

export function agruparCatalogo(celulas: CelulaCatalogo[], nomes: Record<string, string>, filtro: FiltroCatalogo, blocoDe: Record<string, string> = {}): ProdutoRevisao[] {
  const grupos = new Map<string, ProdutoRevisao>();
  const busca = filtro.busca.trim().toLocaleLowerCase('pt-BR');
  for (const c of celulas) {
    if (!DONOS.includes(c.dono) || !['mudanca', 'conflito', 'erro'].includes(c.tipo)) continue;
    if (filtro.bloco && filtro.bloco !== 'todos' && blocoDe[c.campo] !== filtro.bloco) continue;
    if (filtro.campo !== 'todos' && c.campo !== filtro.campo) continue;
    if (filtro.tipo !== 'todos' && c.tipo !== filtro.tipo) continue;
    const nome = nomes[c.cod_cadastro] ?? '';
    if (busca && !`${c.cod_cadastro} ${nome}`.toLocaleLowerCase('pt-BR').includes(busca)) continue;
    const grupo = grupos.get(c.cod_cadastro) ?? { codigo: c.cod_cadastro, nome, celulas: [] };
    grupo.celulas.push(c);
    grupos.set(c.cod_cadastro, grupo);
  }
  return [...grupos.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
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
 * Splits selected cells by owner (Mapa v2). Fiscal (operacoes) → fn_catalogo_resolver as before.
 * Product: mudança and conflict "planilha" go to the FOP; conflict "sistema" and discards never call the FOP.
 * Returns an empty plan while any selected conflict lacks a choice.
 */
export function planoCatalogo(celulas: CelulaCatalogo[], acao: 'aplicar' | 'descartar', escolhas: EscolhasCatalogo): PlanoCatalogo {
  const elegiveis = celulas.filter(c => DONOS.includes(c.dono) && ['mudanca', 'conflito'].includes(c.tipo));
  const operacoes = elegiveis.filter(c => c.dono === 'operacoes');
  const produto = elegiveis.filter(c => c.dono === 'produto');
  if (acao === 'aplicar' && elegiveis.some(c => c.tipo === 'conflito' && !escolhas[c.id])) return { sncf: [], fop: [] };
  const sncf: DecisaoCatalogo[] = decisoesCatalogo(operacoes, acao, escolhas).map(d => ({ ...d, dono: 'operacoes' as const }));
  if (acao === 'descartar') {
    if (produto.length) sncf.push({ ids: produto.map(c => c.id), acao: 'descartar', escolha: 'sistema', dono: 'produto' });
    return { sncf, fop: [] };
  }
  const sistema = produto.filter(c => c.tipo === 'conflito' && escolhas[c.id] === 'sistema');
  if (sistema.length) sncf.push({ ids: sistema.map(c => c.id), acao: 'resolver', escolha: 'sistema', dono: 'produto' });
  const fop = produto.filter(c => c.tipo === 'mudanca' || escolhas[c.id] === 'planilha').map(c => c.id);
  return { sncf, fop };
}
