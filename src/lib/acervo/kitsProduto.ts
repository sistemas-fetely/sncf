export type KitLinha = {
  sku: string; nome: string | null; tipo_estoque: string | null; preco_venda: number | null; ativo: boolean;
  shopify_product_id: string | null; shopify_variant_id: string | null; bling_produto_id: string | null;
  no_bling: boolean; no_shopify: boolean; n_componentes: number; soma_componentes: number | null;
  disponivel: number | null; componentes_inativos: number; criado_em: string | null; atualizado_em: string | null;
};
export type FiltroKits = { busca: string; situacao: string; bling: string };

/** Filtra e ordena por código. situacao: ativos|inativos|todos; bling: todos|sim|nao. */
export function filtrarKits(kits: KitLinha[], f: FiltroKits): KitLinha[] {
  const termo = f.busca.trim().toLowerCase();
  return kits
    .filter(k => f.situacao === "todos" || (f.situacao === "inativos" ? !k.ativo : k.ativo))
    .filter(k => f.bling === "todos" || (f.bling === "sim" ? k.no_bling : !k.no_bling))
    .filter(k => !termo || k.sku.toLowerCase().includes(termo) || (k.nome ?? "").toLowerCase().includes(termo))
    .sort((a, b) => a.sku.localeCompare(b.sku, "pt-BR"));
}

/** Desconto do kit frente à soma dos componentes; null quando não dá para calcular. */
export function descontoKit(soma: number | null, preco: number | null) {
  if (soma == null || preco == null || soma <= 0) return null;
  const valor = soma - preco;
  return { valor, pct: (valor / soma) * 100 };
}

/** Código do kit: maiúsculas, sem espaços. */
export const normalizarCodigoKit = (v: string) => v.toUpperCase().replace(/\s+/g, "");
