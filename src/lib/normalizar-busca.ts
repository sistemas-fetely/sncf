/** Normaliza termo de busca: minúsculas pt-BR, sem acentos, apóstrofos tipográficos → reto, espaços colapsados. */
export function normalizarBusca(s: string | null | undefined): string {
  return (s ?? "")
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’‘`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
