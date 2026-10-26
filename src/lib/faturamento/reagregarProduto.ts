import type { FaturamentoProduto } from "@/hooks/financas/useFaturamento";

const n = (v: number | null | undefined) => Number(v ?? 0);

/** Junta as linhas de estabelecimentos diferentes de uma mesma (sku, canal) numa linha só. */
export function reagregarProdutoPorSkuCanal(rows: FaturamentoProduto[]): FaturamentoProduto[] {
  const mapa = new Map<string, FaturamentoProduto>();
  for (const r of rows) {
    const k = `${r.sku ?? ""}\u0000${r.canal ?? ""}`;
    const a = mapa.get(k);
    if (!a) { mapa.set(k, { ...r, estabelecimento: null }); continue; }
    a.unidades = n(a.unidades) + n(r.unidades);
    a.receita_produto = n(a.receita_produto) + n(r.receita_produto);
    a.receita_frete = n(a.receita_frete) + n(r.receita_frete);
    a.cmv = n(a.cmv) + n(r.cmv);
    a.icms = n(a.icms) + n(r.icms);
    a.margem = n(a.margem) + n(r.margem);
    a.nfs = n(a.nfs) + n(r.nfs);
    a.sem_custo = !!a.sem_custo || !!r.sem_custo;
    a.sku_sem_cadastro = !!a.sku_sem_cadastro || !!r.sku_sem_cadastro;
  }
  for (const a of mapa.values()) {
    a.preco_medio_un = n(a.unidades) > 0 ? n(a.receita_produto) / n(a.unidades) : null;
    a.margem_pct = n(a.receita_produto) > 0 ? n(a.margem) / n(a.receita_produto) : a.margem_pct;
  }
  return Array.from(mapa.values());
}
