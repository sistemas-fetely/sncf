import type { Linha } from "./dados";

export function valorNumero(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function baseDaLiberacao(parcela: Linha): number {
  const base = valorNumero(parcela.base_parcela);
  const comissao = valorNumero(parcela.comissao_da_parcela);
  if (comissao <= 0) return base;
  return Math.round((base * valorNumero(parcela.valor_liberado) / comissao) * 100) / 100;
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

/** Taxa por linha de produto; nunca a média. Ex.: [8, 10] → "8% / 10%". */
export function rotuloTaxas(taxas: unknown): string {
  const lista = Array.isArray(taxas) ? taxas.map(valorNumero) : [];
  const fmt = (n: number) => `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n)}%`;
  if (!lista.length) return "—";
  return lista.map(fmt).join(" / ");
}

/** Uma NF por apuração do mês de vendas, sem repetir a base nas parcelas. */
export function vendasDoMes(parcelas: Linha[], mesVendas: string): Linha[] {
  const notas = new Map<string, Linha>();
  for (const p of parcelas) {
    if (!p.apuracao_id || String(p.competencia).slice(0, 7) !== mesVendas.slice(0, 7)) continue;
    if (!notas.has(String(p.apuracao_id))) notas.set(String(p.apuracao_id), p);
  }
  return [...notas.values()].sort((a, b) => String(a.nf_emissao ?? "").localeCompare(String(b.nf_emissao ?? ""))
    || String(a.nf ?? "").localeCompare(String(b.nf ?? "")));
}

export function totaisVendas(notas: Linha[]): { base: number; comissao: number } {
  const centavos = (campo: string) => Math.round(notas.reduce((s, n) => s + valorNumero(n[campo]), 0) * 100) / 100;
  return { base: centavos("base_comissionavel"), comissao: centavos("comissao_da_nota") };
}

export function taxaDaNota(nota: Linha): string {
  return rotuloTaxas(Array.isArray(nota.taxas_linhas) && nota.taxas_linhas.length ? nota.taxas_linhas : [valorNumero(nota.pct_efetivo)]);
}

/** AAAA-MM somado de n meses. */
export function somarMeses(ym: string, n: number): string {
  const [a, m] = ym.slice(0, 7).split("-").map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

export interface ItemAgenda {
  mes: string; // AAAA-MM do pagamento ao representante
  cliente: string | null;
  pedido: string | null;
  parcela: string; // "2/4" ou "complemento"
  vencimento: string | null; // data ISO do cliente (vencimento ou pagamento)
  pago: boolean;
  base: number | null;
  taxas: unknown;
  comissao: number;
}

export interface MesAgenda { mes: string; pagarAte: string | null; total: number; itens: ItemAgenda[] }

/**
 * Agenda de recebíveis: uma linha por parcela, agrupada pelo mês em que o
 * representante recebe. Competência ≤ documento já foi paga; extratos de
 * competência futura definem o mês das parcelas/complementos que contêm.
 */
export function agendaRecebiveis(parcelas: Linha[], complementos: Linha[], extratos: Linha[], competencia: string, opcoes: { incluirVencidas?: boolean } = {}): MesAgenda[] {
  const comp = competencia.slice(0, 7);
  const pagos = liberacoesEmExtratos(extratos.filter(e => String(e.competencia).slice(0, 7) <= comp));
  const futuros = extratos.filter(e => String(e.competencia).slice(0, 7) > comp);
  const mesFuturo = new Map<string, string>();
  for (const e of futuros) for (const i of Array.isArray(e.detalhe) ? e.detalhe : []) if (i.liberacao_id) mesFuturo.set(String(i.liberacao_id), String(e.competencia).slice(0, 7));
  const clientePorPedido = new Map(parcelas.map(p => [String(p.pedido), p.cliente]));
  const itens: ItemAgenda[] = [];
  const vistos = new Set<string>();
  for (const p of parcelas) {
    const lib = p.liberacao_id ? String(p.liberacao_id) : null;
    const parcela = `${valorNumero(p.numero_parcela)}/${valorNumero(p.total_parcelas)}`;
    if (p.situacao_parcela === "a_vencer" || (opcoes.incluirVencidas && p.situacao_parcela === "vencida")) {
      if (!p.vencimento) continue;
      itens.push({ mes: somarMeses(String(p.vencimento), 1), cliente: p.cliente, pedido: p.pedido, parcela, vencimento: p.vencimento, pago: false, base: valorNumero(p.base_parcela), taxas: p.taxas_linhas, comissao: valorNumero(p.comissao_da_parcela) });
    } else if (p.situacao_parcela === "paga_aguarda_liberacao" || (p.situacao_parcela === "liberada" && lib && !pagos.has(lib))) {
      const pagoEm = p.pago_em ?? p.data_liquidacao ?? null;
      const mes = (lib && mesFuturo.get(lib)) || (p.competencia_pagamento ? String(p.competencia_pagamento).slice(0, 7) : pagoEm ? somarMeses(String(pagoEm), 1) : somarMeses(comp, 1));
      if (lib) vistos.add(lib);
      itens.push({ mes, cliente: p.cliente, pedido: p.pedido, parcela, vencimento: pagoEm, pago: true, base: valorNumero(p.base_parcela), taxas: p.taxas_linhas, comissao: valorNumero(p.valor_liberado ?? p.comissao_da_parcela) });
    }
  }
  for (const c of complementos) {
    if (c.liberacao_id) vistos.add(String(c.liberacao_id));
    itens.push({ mes: c.competencia_pagamento ? String(c.competencia_pagamento).slice(0, 7) : somarMeses(comp, 1), cliente: c.cliente, pedido: c.pedido, parcela: "complemento", vencimento: null, pago: false, base: null, taxas: null, comissao: valorNumero(c.valor) });
  }
  for (const e of futuros) for (const i of Array.isArray(e.detalhe) ? e.detalhe : []) {
    if (i.tipo !== "liberacao" || i.subtipo !== "complemento" || vistos.has(String(i.liberacao_id))) continue;
    itens.push({ mes: String(e.competencia).slice(0, 7), cliente: i.cliente ?? clientePorPedido.get(String(i.pedido)) ?? null, pedido: i.pedido, parcela: "complemento", vencimento: null, pago: false, base: null, taxas: null, comissao: valorNumero(i.valor) });
  }
  const meses = new Map<string, MesAgenda>();
  for (const it of itens) {
    const m = meses.get(it.mes) ?? { mes: it.mes, pagarAte: futuros.find(e => String(e.competencia).slice(0, 7) === it.mes)?.pagar_ate ?? `${it.mes}-15`, total: 0, itens: [] };
    m.itens.push(it); m.total += it.comissao; meses.set(it.mes, m);
  }
  return [...meses.values()].sort((a, b) => a.mes.localeCompare(b.mes)).map(m => ({
    ...m,
    total: Math.round(m.total * 100) / 100,
    itens: m.itens.sort((a, b) => String(a.vencimento ?? "9999").localeCompare(String(b.vencimento ?? "9999"))
      || String(a.cliente ?? "").localeCompare(String(b.cliente ?? ""), "pt-BR") || String(a.pedido ?? "").localeCompare(String(b.pedido ?? ""), "pt-BR")),
  }));
}

/** Parcelas vencidas, uma por linha, mais antigas primeiro. */
export function parcelasEmAtraso(parcelas: Linha[]): Linha[] {
  return parcelas.filter(p => p.situacao_parcela === "vencida")
    .sort((a, b) => String(a.vencimento ?? "").localeCompare(String(b.vencimento ?? "")) || String(a.cliente ?? "").localeCompare(String(b.cliente ?? ""), "pt-BR"));
}

/**
 * Competência apurada (mês que o representante, a NF e o contador chamam de competência)
 * a partir da competência de pagamento do extrato. "2026-11-01" → "2026-10-01".
 * Use só quando a tela recebe apenas `competencia`; quando o banco traz `competencia_apuracao`, use o campo.
 */
export function competenciaApurada(competenciaPagamento: string): string {
  return `${somarMeses(competenciaPagamento, -1)}-01`;
}

/** "2026-10-01" → "10/2026". */
export function mmAaaa(competencia: unknown): string {
  const s = String(competencia ?? "");
  return s.length >= 7 ? `${s.slice(5, 7)}/${s.slice(0, 4)}` : "—";
}

/** Linhas `saldo_anterior` do detalhe (SALDO-ABERTO-TRANSPORTA) — somam no valor_total. */
export function saldosAnterioresDoExtrato(itens: Linha[]): { k: string; rotulo: string; valor: number; motivo: string | null }[] {
  return itens.filter(i => i.tipo === "saldo_anterior").map((i, n) => ({
    k: String(i.extrato_origem_id ?? n),
    rotulo: `Saldo em aberto de ${i.competencia_origem ? mmAaaa(competenciaApurada(String(i.competencia_origem))) : "—"}${valorNumero(i.sequencia_origem) > 1 ? ` (nº ${i.sequencia_origem})` : ""}`,
    valor: valorNumero(i.valor),
    motivo: i.motivo ?? null,
  }));
}
