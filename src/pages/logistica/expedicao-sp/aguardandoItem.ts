import type { EventoMesa, ItemPedidoMesa } from './tipos';

export interface ItemFaltanteMesa { sku: string; nome: string; quantidade: number; fisico_no_cd_no_registro: number }

export function itensFaltantesMesa(valor: unknown): ItemFaltanteMesa[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((i): i is ItemFaltanteMesa => !!i && typeof i.sku === 'string' && typeof i.quantidade === 'number');
}

export function esperaItemMesa(eventos: EventoMesa[]) {
  const e = eventos.filter(e => e.tipo_evento === 'mesa_aguardando_item').sort((a,b) => b.criado_em.localeCompare(a.criado_em)).at(0);
  const m = e?.metadata && typeof e.metadata === 'object' ? e.metadata as Record<string, unknown> : {};
  return { itens: itensFaltantesMesa(m.itens), motivo: typeof m.motivo === 'string' ? m.motivo : '', desde: e?.criado_em ?? null };
}

export function itensPedidoPorSku(itens: ItemPedidoMesa[]) {
  const mapa = new Map<string, { sku: string; nome: string; quantidade: number }>();
  for (const i of itens) {
    if (!i.sku) continue;
    const a = mapa.get(i.sku) ?? { sku: i.sku, nome: i.descricao, quantidade: 0 };
    a.quantidade += Number(i.quantidade); mapa.set(i.sku, a);
  }
  return [...mapa.values()];
}

export function faltantesValidos(itens: { sku: string; quantidade: number }[], pedido: ReturnType<typeof itensPedidoPorSku>, motivo: string) {
  return motivo.trim().length >= 5 && itens.length > 0 && itens.every(i => Number.isFinite(i.quantidade) && i.quantidade > 0 && i.quantidade <= (pedido.find(p => p.sku === i.sku)?.quantidade ?? 0));
}