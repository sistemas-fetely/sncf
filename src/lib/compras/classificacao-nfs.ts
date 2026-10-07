/**
 * Classificação da NF de entrada sem pedido (vw_nfs_stage_mercadoria_pendente).
 * A heurística roda no banco — a view devolve `classificacao`
 * ('mercadoria' | 'possivel' | 'nao_mercadoria'). Aqui só rótulo, pele e filtro.
 */

const CLASSE_PADRAO = "border-border bg-muted text-muted-foreground";

const ROTULO: Record<string, string> = {
  mercadoria: "Mercadoria",
  possivel: "Possível mercadoria",
  nao_mercadoria: "Não parece mercadoria",
};

const CLASSE: Record<string, string> = {
  mercadoria: "border-success/40 bg-success/10 text-success",
  possivel: "border-warning bg-warning/10 text-warning-strong",
  nao_mercadoria: CLASSE_PADRAO,
};

export function rotuloClassificacao(c: string | null): string {
  if (!c) return "—";
  return ROTULO[c] ?? c;
}

export function classeClassificacao(c: string | null): string {
  return (c && CLASSE[c]) || CLASSE_PADRAO;
}

/**
 * Filtro padrão: só 'mercadoria' e 'possivel'. 'nao_mercadoria' (e o que a view
 * ainda não classificou) só aparece com `mostrarTodas` ligado.
 */
export function filtrarPorClassificacao<T extends { classificacao: string | null }>(
  rows: T[],
  mostrarTodas: boolean,
): T[] {
  if (mostrarTodas) return rows;
  return rows.filter((r) => r.classificacao === "mercadoria" || r.classificacao === "possivel");
}
