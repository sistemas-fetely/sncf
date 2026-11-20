export interface CampoVariacao { slug: string; nome: string; ordem: number }
export interface ColecaoAgrupamento {
  colecao: string; grupo: string; tipo: string; skus: number; numerica: boolean;
  agrupados: number; pais_vigentes: number; status: string; agrupamento_ids: string[];
}
export interface PaiAgrupamento {
  chave: string; chave_txt: string; titulo: string; variantes_n: number; problemas: number;
  variantes: { sku: string; nome: string; valores: Record<string, string | null>; problema: string | null }[];
}
export interface PreviaAgrupamento {
  eixos: string[]; promovidos: string[]; total_skus: number; total_pais: number;
  problemas: number; ja_publicado: boolean; pais: PaiAgrupamento[];
}

export function mudarEixos(eixos: string[], slug: string, campos: CampoVariacao[]): string[] {
  const marcado = eixos.includes(slug);
  if ((marcado && eixos.length <= 1) || (!marcado && eixos.length >= 3)) return eixos;
  const proximos = marcado ? eixos.filter((e) => e !== slug) : [...eixos, slug];
  return campos.filter((c) => proximos.includes(c.slug)).map((c) => c.slug);
}

export function podeSalvarAgrupamento(previa: PreviaAgrupamento | undefined, permitido: boolean, carregando: boolean): boolean {
  return !!previa && permitido && !carregando && previa.problemas === 0 && !previa.ja_publicado
    && previa.eixos.length >= 1 && previa.eixos.length <= 3;
}

export function titulosAlterados(pais: PaiAgrupamento[], edicoes: Record<string, string>): Record<string, string> {
  return Object.fromEntries(pais.filter((p) => edicoes[p.chave_txt] !== undefined && edicoes[p.chave_txt] !== p.titulo)
    .map((p) => [p.chave_txt, edicoes[p.chave_txt]]));
}

export interface ProdutoSolto { id?: string; titulo: string; status: string; skus: string[] }
export interface ResultadoPublicacao {
  ok: boolean; dry_run?: boolean; bloqueado?: boolean; erro?: string; status?: string;
  variantes?: number; opcoes?: { name: string; values: { name: string }[] }[];
  remover?: ProdutoSolto[]; bloqueios?: { erro: string; produto?: ProdutoSolto }[];
  nao_removidos?: (ProdutoSolto & { erro: string })[]; avisos?: string[];
}
export function podePublicarAgrupamento(simulacao: ResultadoPublicacao | null, permitido: boolean, alterado: boolean, ocupado = false): boolean {
  return !!simulacao?.ok && simulacao.dry_run === true && !simulacao.bloqueado && permitido && !alterado && !ocupado;
}
export function eixosDiferentes(eixos: string[] | null, salvos: string[][]): boolean {
  return eixos !== null && (!salvos.length || salvos.some((s) => JSON.stringify(s) !== JSON.stringify(eixos)));
}