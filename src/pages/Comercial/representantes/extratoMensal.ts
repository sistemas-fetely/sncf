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

export function rotuloParcelas(lista: number[], total: number): string {
  const ordem = [...lista].sort((a, b) => a - b);
  if (!ordem.length) return "";
  const contiguas = ordem.length > 1 && ordem.every((n, i) => i === 0 || n === ordem[i - 1] + 1);
  const meio = contiguas ? `${ordem[0]} a ${ordem[ordem.length - 1]}` : ordem.join(", ");
  return total > 0 ? `${meio} de ${total}` : meio;
}

export function liberacoesEmExtratos(extratos: Linha[]): Set<string> {
  return new Set(extratos.flatMap(e => Array.isArray(e.detalhe) ? e.detalhe : [])
    .filter(i => i.liberacao_id).map(i => String(i.liberacao_id)));
}

export function parcelaAReceber(p: Linha, liberacoes: Set<string>): boolean {
  return p.situacao_parcela === "a_vencer" || p.situacao_parcela === "paga_aguarda_liberacao"
    || (p.situacao_parcela === "liberada" && Boolean(p.liberacao_id) && !liberacoes.has(String(p.liberacao_id)));
}

export function representantesDoLote(extratos: Linha[], parcelas: Linha[], complementos: Linha[], competencia: string): string[] {
  const porVendedor = new Map<string, Set<string>>();
  for (const e of extratos) {
    const id = String(e.vendedor_id);
    const ids = porVendedor.get(id) ?? new Set<string>();
    for (const lib of liberacoesEmExtratos([e])) ids.add(lib);
    porVendedor.set(id, ids);
  }
  return [...new Set([
    ...extratos.filter(e => String(e.competencia).slice(0, 7) === competencia),
    ...parcelas.filter(p => p.situacao_parcela === "vencida" || parcelaAReceber(p, porVendedor.get(String(p.vendedor_id)) ?? new Set<string>())),
    ...complementos,
  ].filter(l => l.vendedor_id).map(l => String(l.vendedor_id)))];
}

export function carteiraPorPedido(parcelas: Linha[], status: "a_vencer" | "vencida", liberacoes?: Set<string>): Linha[] {
  const totais = new Map<string, number>();
  for (const p of parcelas) {
    const chave = String(p.pedido_id ?? `${p.cliente}\u0000${p.pedido}`);
    const n = Math.max(valorNumero(p.total_parcelas), valorNumero(p.numero_parcela));
    if (n > (totais.get(chave) ?? 0)) totais.set(chave, n);
  }
  const grupos = new Map<string, Linha>();
  for (const p of parcelas.filter(p => status === "a_vencer" && liberacoes ? parcelaAReceber(p, liberacoes) : p.situacao_parcela === status)) {
    const chave = String(p.pedido_id ?? `${p.cliente}\u0000${p.pedido}`);
    const g = grupos.get(chave) ?? { cliente: p.cliente, pedido: p.pedido, parcelas: 0, vencimento: null, dias_atraso: 0, comissao: 0, parcelas_lista: [] as number[], total_parcelas: totais.get(chave) ?? 0 };
    g.parcelas += 1;
    const n = valorNumero(p.numero_parcela);
    if (n > 0 && !g.parcelas_lista.includes(n)) g.parcelas_lista.push(n);
    if ((p.situacao_parcela === "a_vencer" || status === "vencida") && p.vencimento && (!g.vencimento || p.vencimento < g.vencimento)) g.vencimento = p.vencimento;
    g.dias_atraso = Math.max(g.dias_atraso, valorNumero(p.dias_atraso));
    g.comissao += valorNumero(p.situacao_parcela === "liberada" ? p.valor_liberado : p.comissao_da_parcela);
    grupos.set(chave, g);
  }
  return [...grupos.values()].sort((a, b) => String(a.cliente ?? "").localeCompare(String(b.cliente ?? ""), "pt-BR")
    || String(a.pedido ?? "").localeCompare(String(b.pedido ?? ""), "pt-BR"));
}

/** Taxa por linha de produto; nunca a média. Ex.: [8, 10] → "8% / 10%". */
export function rotuloTaxas(taxas: unknown): string {
  const lista = Array.isArray(taxas) ? taxas.map(valorNumero) : [];
  const fmt = (n: number) => `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n)}%`;
  if (!lista.length) return "—";
  return lista.map(fmt).join(" / ");
}

/** Complementos pendentes viram linhas comuns do "A receber". */
export function complementosNaCarteira(complementos: Linha[]): Linha[] {
  return complementos.map(c => ({ cliente: c.cliente, pedido: c.pedido, comissao: valorNumero(c.valor), complemento: true }))
    .sort((a, b) => String(a.cliente ?? "").localeCompare(String(b.cliente ?? ""), "pt-BR"));
}
