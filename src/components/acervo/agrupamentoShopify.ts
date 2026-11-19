export interface CampoVariacao { slug: string; nome: string; ordem: number }
export interface ColecaoAgrupamento {
  colecao: string; grupo: string; tipo: string; skus: number; numerica: boolean;
  agrupados: number; pais_vigentes: number; status: string;
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