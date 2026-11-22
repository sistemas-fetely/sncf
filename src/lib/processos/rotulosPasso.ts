// Rótulos e filtro dos passos do motor (vw_processo_passo_vivo).
// O código de trecho/canal vem do banco; a tradução é só apresentação e vive aqui
// para a tela não carregar ternários soltos nem inventar nome para valor novo.
// Valor desconhecido continua mostrando o próprio texto (ou o canal em maiúsculas),
// assim um código novo nunca some da tela nem ganha nome errado.

export const ROTULOS_TRECHO: Record<string, string> = {
  antes_nf: "Antes da NF",
  nf_nao_expedida: "NF emitida, não saiu",
  correcao_nf: "Correção de NF",
  entrega_falhou: "Entrega falhou",
  retornando: "Retornando",
  entregue_devolucao: "Entregue: cliente devolve",
};

export function rotuloTrecho(trecho: string | null | undefined): string | null {
  if (!trecho) return null;
  return ROTULOS_TRECHO[trecho] ?? trecho;
}

export const ROTULOS_CANAL: Record<string, string> = {
  todos: "Todos os canais",
  site_sp: "Site SP",
  b2b: "B2B",
  b2c: "B2C",
};

export function rotuloCanal(canal: string | null | undefined): string | null {
  if (!canal) return null;
  return ROTULOS_CANAL[canal] ?? canal.toUpperCase();
}

/** "sem_filtro" = mostrar tudo; os demais batem com o valor de canal da view. */
export type FiltroCanalPasso = "sem_filtro" | "b2c" | "b2b" | "site_sp" | "todos";

export const FILTROS_CANAL_PASSO: { valor: FiltroCanalPasso; rotulo: string }[] = [
  { valor: "sem_filtro", rotulo: "Todos" },
  { valor: "b2c", rotulo: "B2C" },
  { valor: "b2b", rotulo: "B2B" },
  { valor: "site_sp", rotulo: "Site SP" },
  { valor: "todos", rotulo: "Todos os canais" },
];

/** Filtro só de exibição: passo sem canal aparece apenas sem filtro. */
export function passoNoCanal(
  canal: string | null | undefined,
  filtro: FiltroCanalPasso,
): boolean {
  if (filtro === "sem_filtro") return true;
  return canal === filtro;
}
