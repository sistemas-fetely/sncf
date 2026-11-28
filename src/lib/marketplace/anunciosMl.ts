// Recortes da aba "Anúncios ML". O recorte de cada anúncio vem pronto de vw_ml_anuncio_gestao;
// aqui só se decide o que cada pílula mostra e se conta, espelhando a regra da view.
export type RecorteMl = 'anunciado' | 'pausado' | 'sem_anuncio' | 'preco_diferente' | 'vinculo_quebrado' | 'revisao' | 'encerrado';
export const RECORTES_ML: { codigo: RecorteMl; rotulo: string }[] = [
  { codigo: 'anunciado', rotulo: 'Anunciados' }, { codigo: 'pausado', rotulo: 'Pausados' },
  { codigo: 'sem_anuncio', rotulo: 'Sem anúncio' }, { codigo: 'preco_diferente', rotulo: 'Preço diferente' },
  { codigo: 'vinculo_quebrado', rotulo: 'Vínculo quebrado' }, { codigo: 'revisao', rotulo: 'Em revisão' },
  { codigo: 'encerrado', rotulo: 'Encerrados' },
];
export interface AnuncioMl {
  id: number; titulo: string | null; anuncio_loja_id: string | null; situacao: number | null;
  situacao_rotulo: string | null; situacao_cor: string | null; preco: number | null; preco_varejo: number | null;
  diferenca_preco: number | null; sku: string | null; cod_cadastro: string | null; nome_comercial: string | null;
  url_ml: string | null; recorte: string; preco_diferente: boolean; qtd_imagens: number | null; visto_em: string;
}
/** Mesma regra da view (para teste e conferência): sem SKU vence tudo; depois situação. */
export function recorteDoAnuncio(a: { sku: string | null; situacao: number | null }): string {
  if (!a.sku) return 'vinculo_quebrado';
  if (a.situacao === 3 || a.situacao === 5) return 'pausado';
  if (a.situacao === 1) return 'anunciado';
  if (a.situacao === 4) return 'encerrado';
  if (a.situacao === 2) return 'revisao';
  return 'outro';
}
export function precoDiferente(a: { sku: string | null; preco: number | null; preco_varejo: number | null }) {
  return !!a.sku && a.preco_varejo != null && a.preco != null && Math.abs(Number(a.preco) - Number(a.preco_varejo)) >= 0.01;
}
/** "Preço diferente" é sobreposição (atravessa situações); os demais são o recorte da view. */
export function noRecorte(a: AnuncioMl, r: RecorteMl) {
  return r === 'preco_diferente' ? a.preco_diferente : a.recorte === r;
}
export function contarRecortes(lista: AnuncioMl[], semAnuncio: number): Record<RecorteMl, number> {
  const c = Object.fromEntries(RECORTES_ML.map(r => [r.codigo, 0])) as Record<RecorteMl, number>;
  for (const a of lista) { if (a.recorte in c) c[a.recorte as RecorteMl]++; if (a.preco_diferente) c.preco_diferente++; }
  c.sem_anuncio = semAnuncio;
  return c;
}
export function bateBusca(texto: string, ...campos: (string | null | undefined)[]) {
  const t = texto.trim().toLowerCase();
  return !t || campos.some(c => (c ?? '').toLowerCase().includes(t));
}
