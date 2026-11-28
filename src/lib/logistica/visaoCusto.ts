/** Visão de custo do frete por fatura (lentes Caixa × Competência). Regras puras, testadas. */
export type EstadoPagamento = "pago" | "pago_sem_conciliar" | "pago_sem_titulo" | "vencido" | "a_vencer" | "sem_titulo" | "cancelado";
export type Lente = "caixa" | "competencia";
export interface FaturaCusto {
  fatura_id: string; transportadora_id: string; transportadora: string | null; canal: string | null;
  numero_fatura: string | null; data_emissao: string | null; data_vencimento: string | null;
  valor_total: number | null; conta_pagar_id: string | null; titulo_status: string | null;
  valor_pago: number | null; saldo: number | null; estado_pagamento: EstadoPagamento;
  data_pagamento: string | null; sugestao_mov_id: string | null; sugestao_mov_data: string | null;
  sugestao_mov_descricao: string | null; data_caixa: string | null; data_competencia: string | null;
}
export interface Periodo { de: string; ate: string }
export const PENDENCIAS: EstadoPagamento[] = ["vencido", "pago_sem_conciliar", "pago_sem_titulo", "sem_titulo"];
const n = (v: number | null | undefined) => Number(v ?? 0);
const r2 = (v: number) => Math.round(v * 100) / 100;
const dia = (s: string | null) => (s ? s.slice(0, 10) : null);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function periodoAtalho(atalho: string, hoje = new Date()): Periodo {
  const y = hoje.getFullYear(), m = hoje.getMonth();
  if (atalho === "mes") return { de: iso(new Date(y, m, 1)), ate: iso(hoje) };
  if (atalho === "mes_anterior") return { de: iso(new Date(y, m - 1, 1)), ate: iso(new Date(y, m, 0)) };
  if (atalho === "ano") return { de: iso(new Date(y, 0, 1)), ate: iso(hoje) };
  const ini = new Date(hoje); ini.setMonth(ini.getMonth() - 3);
  return { de: iso(ini), ate: iso(hoje) };
}
export const dataDaLente = (f: FaturaCusto, lente: Lente) => dia(lente === "caixa" ? f.data_caixa : f.data_competencia);
export function noPeriodo(f: FaturaCusto, lente: Lente, p: Periodo) {
  const d = dataDaLente(f, lente); return !!d && d >= p.de && d <= p.ate;
}
/** Valor que a célula/linha conta na lente: Caixa = pago + saldo dos pago_sem_*; Competência = valor_total. */
export function valorNaLente(f: FaturaCusto, lente: Lente) {
  if (f.estado_pagamento === "cancelado") return 0;
  if (lente === "competencia") return n(f.valor_total);
  if (f.estado_pagamento === "pago") return n(f.valor_pago);
  if (f.estado_pagamento === "pago_sem_conciliar" || f.estado_pagamento === "pago_sem_titulo") return n(f.saldo);
  return 0;
}
export function cardsVisao(fs: FaturaCusto[], lente: Lente, p: Periodo) {
  const per = fs.filter((f) => noPeriodo(f, lente, p));
  const soma = (xs: FaturaCusto[], g: (f: FaturaCusto) => number) => r2(xs.reduce((a, f) => a + g(f), 0));
  const pagos = per.filter((f) => f.estado_pagamento === "pago");
  const semConc = per.filter((f) => f.estado_pagamento === "pago_sem_conciliar" || f.estado_pagamento === "pago_sem_titulo");
  const pago = soma(pagos, (f) => n(f.valor_pago));
  const pagoSemConciliar = soma(semConc, (f) => n(f.saldo));
  const vencidas = fs.filter((f) => f.estado_pagamento === "vencido");
  const maisAntiga = vencidas.map((f) => dia(f.data_vencimento)).filter(Boolean).sort()[0] ?? null;
  return {
    pago, pagoFaturas: pagos.length, pagoSemConciliar, pagoSemConciliarFaturas: semConc.length, totalSaido: r2(pago + pagoSemConciliar),
    cobrado: soma(per.filter((f) => f.estado_pagamento !== "cancelado"), (f) => n(f.valor_total)),
    aVencer: soma(fs.filter((f) => f.estado_pagamento === "a_vencer"), (f) => n(f.saldo)),
    vencido: soma(vencidas, (f) => n(f.saldo)), vencidoMaisAntiga: maisAntiga,
    semTitulo: soma(fs.filter((f) => f.estado_pagamento === "sem_titulo"), (f) => n(f.valor_total)),
  };
}
export const mesDe = (d: string) => d.slice(0, 7);
export function mesesDoPeriodo(p: Periodo): string[] {
  const out: string[] = []; let [y, m] = p.de.slice(0, 7).split("-").map(Number);
  const fim = p.ate.slice(0, 7);
  for (let i = 0; i < 240; i++) { const k = `${y}-${String(m).padStart(2, "0")}`; if (k > fim) break; out.push(k); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
/** Frete ÷ faturamento: receita somada de todos os canais dos meses que tocam o período. */
export function freteSobreFaturamento(cobrado: number, receitas: { mes: string; receita_total: number | null }[], p: Periodo) {
  const meses = new Set(mesesDoPeriodo(p));
  const rec = receitas.filter((r) => meses.has(mesDe(r.mes))).reduce((a, r) => a + n(r.receita_total), 0);
  return rec > 0 ? (cobrado / rec) * 100 : null;
}
export function matrizVisao(fs: FaturaCusto[], lente: Lente, p: Periodo) {
  const meses = mesesDoPeriodo(p);
  const linhas = new Map<string, { id: string; nome: string; celulas: Record<string, number>; total: number }>();
  const colunas: Record<string, number> = Object.fromEntries(meses.map((m) => [m, 0]));
  let total = 0;
  for (const f of fs) {
    if (!noPeriodo(f, lente, p)) continue;
    const v = valorNaLente(f, lente); const m = mesDe(dataDaLente(f, lente)!);
    const l = linhas.get(f.transportadora_id) ?? { id: f.transportadora_id, nome: f.transportadora ?? "—", celulas: {}, total: 0 };
    l.celulas[m] = r2((l.celulas[m] ?? 0) + v); l.total = r2(l.total + v); linhas.set(f.transportadora_id, l);
    colunas[m] = r2((colunas[m] ?? 0) + v); total = r2(total + v);
  }
  return { meses, linhas: [...linhas.values()].sort((a, b) => b.total - a.total), colunas, total };
}
/** Lista: período pela lente + pendências de fora; filtro de célula restringe a transportadora+mês. */
export function listaVisao(fs: FaturaCusto[], lente: Lente, p: Periodo, celula?: { transportadoraId: string; mes: string } | null) {
  const base = celula
    ? fs.filter((f) => f.transportadora_id === celula.transportadoraId && noPeriodo(f, lente, p) && mesDe(dataDaLente(f, lente)!) === celula.mes)
    : fs.filter((f) => noPeriodo(f, lente, p) || PENDENCIAS.includes(f.estado_pagamento));
  return ordenarVisao(base);
}
export function ordenarVisao(fs: FaturaCusto[]) {
  const pr = (f: FaturaCusto) => { const i = PENDENCIAS.indexOf(f.estado_pagamento); return i < 0 ? 99 : i; };
  return [...fs].sort((a, b) => pr(a) - pr(b) || (b.data_vencimento ?? "").localeCompare(a.data_vencimento ?? ""));
}
export function contagemEstados(fs: FaturaCusto[]) {
  const c: Partial<Record<EstadoPagamento, number>> = {};
  for (const f of fs) c[f.estado_pagamento] = (c[f.estado_pagamento] ?? 0) + 1;
  return c;
}
