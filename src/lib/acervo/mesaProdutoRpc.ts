export const BUSCA_MESA_DEBOUNCE_MS = 300;
/** Seleção primeiro, ausências por último; dimensões preservam sua ordem de negócio. */
export function ordenarFacetasMesa<T extends { valor: string | null; rotulo: string }>(
  opcoes: readonly T[], selecionados: readonly string[], ordemDim?: ReadonlyMap<string, number>,
): T[] {
  const marcados = new Set(selecionados);
  const vazia = (valor: string | null) => !valor?.trim() || valor === "__sem__";
  return [...opcoes].sort((a, b) => {
    const ausencia = Number(vazia(a.valor)) - Number(vazia(b.valor));
    if (ausencia) return ausencia;
    const selecao = Number(b.valor !== null && marcados.has(b.valor)) - Number(a.valor !== null && marcados.has(a.valor));
    if (selecao) return selecao;
    if (ordemDim) {
      const ordem = (ordemDim.get(a.valor ?? "") ?? Infinity) - (ordemDim.get(b.valor ?? "") ?? Infinity);
      if (ordem && !Number.isNaN(ordem)) return ordem;
    }
    return a.rotulo.localeCompare(b.rotulo, "pt-BR", { sensitivity: "base" });
  });
}
const COLUNAS = ["cod_cadastro", "sku", "nome_comercial", "fase_ordem", "pendencias", "qtd_falta_proxima", "qtd_divergencias", "atualizado_em"] as const;
export type OrdemMesa = typeof COLUNAS[number];
export function parametrosMesaProduto(entrada: {
  busca: string; situacao: string[]; fase: string[]; colecao: string[];
  grupo: string[]; sistemas: string[]; indicador: string | null;
  ordem_coluna: string; ordem_dir: "asc" | "desc"; pagina: number; tamanho: number;
}) {
  return { ...entrada, ordem_coluna: COLUNAS.find(c => c === entrada.ordem_coluna) ?? "cod_cadastro" };
}