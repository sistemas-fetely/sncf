export const BUSCA_MESA_DEBOUNCE_MS = 300;
const COLUNAS = ["cod_cadastro", "sku", "nome_comercial", "fase_ordem", "pendencias", "qtd_falta_proxima", "qtd_divergencias", "atualizado_em"] as const;
export type OrdemMesa = typeof COLUNAS[number];
export function parametrosMesaProduto(entrada: {
  busca: string; situacao: string[]; fase: string[]; colecao: string[];
  grupo: string[]; sistemas: string[]; indicador: string | null;
  ordem_coluna: string; ordem_dir: "asc" | "desc"; pagina: number; tamanho: number;
}) {
  return { ...entrada, ordem_coluna: COLUNAS.find(c => c === entrada.ordem_coluna) ?? "cod_cadastro" };
}