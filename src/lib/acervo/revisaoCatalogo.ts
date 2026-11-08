import type { Database } from "@/integrations/supabase/types";

export type CelulaCatalogo = Database['public']['Tables']['catalogo_planilha_mudanca']['Row'];
export const CAMPOS_OPERACOES = ['ncm', 'cest', 'origem_fisc', 'origem_prod'];
export type ProdutoRevisao = { codigo: string; nome: string; celulas: CelulaCatalogo[] };
export type EscolhasCatalogo = Record<string, 'planilha' | 'sistema'>;
export type DecisaoCatalogo = { ids: string[]; acao: 'aplicar' | 'descartar' | 'resolver'; escolha: 'planilha' | 'sistema' };

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

export function agruparCatalogo(celulas: CelulaCatalogo[], nomes: Record<string, string>, filtro: { campo: string; tipo: string; busca: string }): ProdutoRevisao[] {
  const grupos = new Map<string, ProdutoRevisao>();
  const busca = filtro.busca.trim().toLocaleLowerCase('pt-BR');
  for (const c of celulas) {
    if (c.dono !== 'operacoes' || !['mudanca', 'conflito', 'erro'].includes(c.tipo)) continue;
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