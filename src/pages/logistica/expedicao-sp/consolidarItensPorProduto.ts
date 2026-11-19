import { normalizarGtin } from "@/lib/estoque/resolverCodigoBarras";
import type { ItemConferido, ItemPedidoMesa } from "./tipos";

export interface ItemConsolidadoMesa extends ItemPedidoMesa {
  linhas_origem: { id: string; qtd: number }[];
}

/** Preserve first appearance/identity; quantities and provenance are copied, never mutate order lines. */
export function consolidarItensPorProduto(itens: ItemPedidoMesa[]): ItemConsolidadoMesa[] {
  const grupos = new Map<string, ItemConsolidadoMesa>();
  for (const item of itens) {
    const produto = item.produto_id?.trim();
    const sku = item.sku?.trim().toUpperCase();
    const cod = item.cod_cadastro?.trim();
    const ean = normalizarGtin(item.ean) || item.ean?.trim();
    const chave = produto ? `produto:${produto}` : sku ? `sku:${sku}` : cod ? `cod:${cod}` : ean ? `ean:${ean}` : `linha:${item.id}`;
    const origem = { id: item.id, qtd: item.quantidade };
    const existente = grupos.get(chave);
    if (existente) {
      existente.quantidade += item.quantidade;
      existente.linhas_origem.push(origem);
      existente.sku ??= item.sku;
      existente.ean ??= item.ean;
      existente.cod_cadastro ??= item.cod_cadastro;
    } else grupos.set(chave, { ...item, linhas_origem: [origem] });
  }
  return [...grupos.values()];
}

export function itensConsolidadosParaConferencia(itens: ItemConsolidadoMesa[], bipados: Record<string, number>): ItemConferido[] {
  return itens.map(i => ({ produto_id: i.produto_id ?? null, sku: i.sku, ean: i.ean,
    esperado: i.quantidade, bipado: bipados[i.id] ?? 0,
    linhas_origem: i.linhas_origem.map(l => ({ ...l })),
  }));
}