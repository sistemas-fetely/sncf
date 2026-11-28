// Conciliação de Cadastro — cada vista com UMA pergunta (28/11/2026).
// A superfície de cada regra vem de `divergencia_regra.superficie`
// (dimensão `divergencia_superficie_dim`); aqui só agrupamos e filtramos.

export type LinhaPendencia = {
  linha_id: string; regra: string; regra_nome: string | null;
  cod_cadastro: string | null; sku: string | null; nome_comercial: string | null;
  o_que_fazer: string | null; rota_resolver: string | null;
  campo_matriz: string | null; valor_matriz: string | null;
};

export type GrupoPendencia = { regra: string; nome: string; o_que_fazer: string | null; linhas: LinhaPendencia[] };

/** Agrupa as pendências de cadastro por regra, maior contador primeiro. */
export function agruparPendencias(linhas: LinhaPendencia[]): GrupoPendencia[] {
  const m = new Map<string, GrupoPendencia>();
  for (const l of linhas) {
    const g = m.get(l.regra) ?? { regra: l.regra, nome: l.regra_nome ?? l.regra, o_que_fazer: l.o_que_fazer, linhas: [] };
    g.linhas.push(l);
    m.set(l.regra, g);
  }
  return [...m.values()].sort((a, b) => b.linhas.length - a.linhas.length || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Rota da regra com {cod_cadastro} preenchido; null quando não há rota ou código. */
export function rotaDaPendencia(rota: string | null, cod: string | null): string | null {
  if (!rota) return null;
  if (rota.includes("{cod_cadastro}")) return cod ? rota.split("{cod_cadastro}").join(encodeURIComponent(cod)) : null;
  return rota;
}

/** Canais da dimensão que têm ao menos uma regra na superfície pedida. */
export function canaisDaSuperficie<T extends { slug: string }>(
  dim: T[], regras: { onde_resolver: string | null; superficie: string | null }[], superficie = "divergencias",
): T[] {
  const usados = new Set(regras.filter(r => r.superficie === superficie).map(r => r.onde_resolver));
  return dim.filter(d => usados.has(d.slug));
}
