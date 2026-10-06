import type { Linha } from "./dados";

export function valorNumero(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function pagamentosDoExtrato(itens: Linha[], parcelas: Linha[]): Linha[] {
  const porId = new Map(parcelas.filter(p => p.liberacao_id).map(p => [String(p.liberacao_id), p]));
  return itens.filter(i => i.tipo === "liberacao" && i.subtipo !== "complemento").map(i => {
    const parcela = porId.get(String(i.liberacao_id));
    if (!parcela) throw new Error(`Liberação ${i.liberacao_id ?? "sem ID"} do extrato não encontrada no detalhamento das parcelas.`);
    return parcela;
  }).sort((a, b) => String(a.cliente ?? "").localeCompare(String(b.cliente ?? ""), "pt-BR")
    || String(a.pedido ?? "").localeCompare(String(b.pedido ?? ""), "pt-BR")
    || valorNumero(a.numero_parcela) - valorNumero(b.numero_parcela));
}

export function ajustesDoExtrato(itens: Linha[]): Linha[] {
  return itens.filter(i => i.tipo === "estorno" || (i.tipo === "liberacao" && i.subtipo === "complemento"));
}

export function carteiraPorPedido(parcelas: Linha[], status: "a_vencer" | "vencida"): Linha[] {
  const grupos = new Map<string, Linha>();
  for (const p of parcelas.filter(p => p.situacao_parcela === status)) {
    const chave = String(p.pedido_id ?? `${p.cliente}\u0000${p.pedido}`);
    const g = grupos.get(chave) ?? { cliente: p.cliente, pedido: p.pedido, parcelas: 0, vencimento: null, dias_atraso: 0, comissao: 0 };
    g.parcelas += 1;
    if (p.vencimento && (!g.vencimento || p.vencimento < g.vencimento)) g.vencimento = p.vencimento;
    g.dias_atraso = Math.max(g.dias_atraso, valorNumero(p.dias_atraso));
    g.comissao += valorNumero(p.comissao_da_parcela);
    grupos.set(chave, g);
  }
  return [...grupos.values()].sort((a, b) => String(a.cliente ?? "").localeCompare(String(b.cliente ?? ""), "pt-BR")
    || String(a.pedido ?? "").localeCompare(String(b.pedido ?? ""), "pt-BR"));
}