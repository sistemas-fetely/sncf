/**
 * Mercado Pago — Liberações (Reserve and Release). Versão ÚNICA usada pela tela
 * (XLSX manual) e pela edge `mp-relatorios` (CSV da API). Puro: sem XLSX, sem toast.
 *
 * Tudo que é dinheiro vem com TIPO DE REGISTRO = "Liberações" (CSV: RECORD_TYPE=release).
 * Valor assinado = crédito − débito. "Reserva…" (CSV reserve_for_*) é par neutro: fora.
 * Saldo inicial e Total ficam fora pelo tipo de registro.
 *
 * SAQUES (Flávio, 03/11/2026): no automático vêm SÓ por aqui. O relatório de retiradas
 * (mp_withdraw) é só manual; os dois caminhos checam `saqueJaRegistrado` para que o
 * mesmo saque (mesmo id de operação e valor) nunca entre duas vezes.
 */
import { gerarHashMov } from "../hash-mov.ts";
import { inserirMovimentacao } from "../inserir-mov.ts";
import type { ContagemImportacao } from "../contagem-importacao.ts";

// deno-lint-ignore no-explicit-any
type Client = any;

export interface MpLiberacao {
  data_liberacao: string;     // ISO
  id_operacao: string;
  descricao: string;
  valor_liquido: number;      // assinado
  meio_pagamento: string;
  codigo_referencia: string;  // token Shopify
  saldo_apos: number;
  descricao_mp: string;       // conteúdo da coluna DESCRIÇÃO (em português)
  conta_destino: string;      // CONTA DE DESTINO DA RETIRADA
  origem: "mp_reserve_release";
}

export function normMp(s: unknown): string {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}
export function isoMp(v: unknown): string {
  const m = String(v ?? "").match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}
export function numMp(v: unknown): number {
  return parseFloat(String(v ?? "0").replace(",", ".")) || 0;
}

/** CSV da API → valores do XLSX manual (português), para o resto da regra ser igual. */
const DESCRICAO_CSV: Record<string, string> = {
  payment: "Pagamento", payout: "Saque", refund: "Devolução", reserve_for_payout: "Reserva para saque",
};
const MEIO_CSV: Record<string, string> = {
  pix: "Pix", master: "Mastercard", visa: "Visa", amex: "American Express", elo: "Elo", hipercard: "Hipercard",
  available_money: "Saldo disponível", bolbradesco: "Boleto Bradesco", account_money: "Saldo disponível", debvisa: "Visa Débito", debmaster: "Mastercard Débito",
};
export function descricaoCsvParaPt(v: string): string {
  const k = normMp(v);
  if (DESCRICAO_CSV[k]) return DESCRICAO_CSV[k];
  if (k.startsWith("reserve")) return `Reserva ${k.slice(7).replace(/_/g, " ").trim()}`.trim();
  return v;
}
export function meioCsvParaPt(v: string): string {
  return MEIO_CSV[normMp(v)] ?? v;
}

/** Linhas (cabeçalho na 1ª) do XLSX manual (pt) OU do CSV da API (chaves em inglês). */
export function normalizarMpRelease(rows: unknown[][]): MpLiberacao[] {
  if (rows.length < 2) return [];
  const header = (rows[0] as unknown[]).map(normMp);
  const csv = header.includes("record_type");
  const idx = (pt: string, en: string) => csv ? header.indexOf(en) : header.findIndex((h) => h.includes(normMp(pt)));
  const iDataLib = idx("data de liberacao", "date");
  const iIdOp = idx("id da operacao", "source_id");
  const iDescricao = idx("descricao", "description");
  const iCredito = idx("valor liquido creditado", "net_credit_amount");
  const iDebito = idx("valor liquido debitado", "net_debit_amount");
  const iMeio = idx("meio de pagamento", "payment_method");
  const iCodRef = idx("codigo de referencia", "external_reference");
  const iSaldo = idx("saldo", "balance_amount");
  const iTipoReg = idx("tipo de registro", "record_type");
  const iContaDest = idx("conta de destino da retirada", "payout_bank_account_number");

  const out: MpLiberacao[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    if (!row) continue;
    const tipoReg = normMp(row[iTipoReg]);
    if (!(csv ? tipoReg === "release" : tipoReg.includes("libera"))) continue;
    const bruta = String(row[iDescricao] ?? "");
    const descricao = csv ? descricaoCsvParaPt(bruta) : bruta;
    if (normMp(descricao).startsWith("reserva")) continue;
    const valor = Math.round((numMp(row[iCredito]) - numMp(row[iDebito])) * 100) / 100;
    if (valor === 0) continue;
    const meio = String(row[iMeio] ?? "");
    out.push({
      data_liberacao: isoMp(row[iDataLib]),
      id_operacao: String(row[iIdOp] ?? ""),
      descricao,
      valor_liquido: valor,
      meio_pagamento: csv ? meioCsvParaPt(meio) : meio,
      codigo_referencia: String(row[iCodRef] ?? ""),
      saldo_apos: numMp(row[iSaldo]),
      descricao_mp: descricao,
      conta_destino: iContaDest >= 0 ? String(row[iContaDest] ?? "") : "",
      origem: "mp_reserve_release",
    });
  }
  return out;
}

/** CSV `;` da API (o JSON de METADATA não traz `;`). Tira aspas externas. */
export function lerCsvMp(texto: string): unknown[][] {
  const sep = (texto.split("\n", 1)[0].match(/;/g)?.length ?? 0) > 0 ? ";" : ",";
  return texto.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim() !== "")
    .map((l) => l.split(sep).map((c) => c.replace(/^"(.*)"$/s, "$1")));
}

/** Mesmo saque já gravado por OUTRO caminho (liberações × retiradas): mesmo id e valor. */
export async function saqueJaRegistrado(sb: Client, conta: string, idOperacao: string, valor: number, origemOutra: "mp_release" | "mp_withdraw"): Promise<boolean> {
  if (!idOperacao) return false;
  const { data, error } = await sb.from("movimentacoes_bancarias").select("id")
    .eq("conta_bancaria_id", conta).eq("id_transacao_banco", idOperacao).eq("origem", origemOutra)
    .eq("valor", valor).is("duplicada_de", null).limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** O laço da importação: hash `mp_rr|<id>`, duplicidade, inserção. Igual no manual e no automático. */
export async function aplicarMpRelease(sb: Client, conta: string, impId: string, liberacoes: MpLiberacao[], cont: ContagemImportacao, cnpjProprio: string | null): Promise<void> {
  for (const l of liberacoes) {
    if (!l.id_operacao) { cont.ignorar("sem_identificador"); continue; }
    const hash = await gerarHashMov(conta, l.data_liberacao, l.valor_liquido, `mp_rr|${l.id_operacao}`);
    const { data: exist, error: errEx } = await sb.from("movimentacoes_bancarias").select("id").eq("hash_unico", hash).maybeSingle();
    if (errEx) throw errEx;
    if (exist) { cont.duplicada(); continue; }

    const desc = normMp(l.descricao_mp);
    const ehSaque = desc.startsWith("saque");
    const ehDevolucao = desc.startsWith("devolucao");
    if (ehSaque && await saqueJaRegistrado(sb, conta, l.id_operacao, l.valor_liquido, "mp_withdraw")) { cont.duplicada(); continue; }
    const meio = l.meio_pagamento.toUpperCase();
    let descricao: string; let tipoMeio: string;
    if (ehSaque) { descricao = `MP SAQUE PARA CONTA ${l.conta_destino}`.trim(); tipoMeio = "transferencia"; }
    else if (ehDevolucao) { descricao = `MP DEVOLUCAO ${meio}`.trim(); tipoMeio = "outro"; }
    else {
      const m = normMp(l.meio_pagamento);
      descricao = `MP PAGAMENTO ${meio}`.trim();
      tipoMeio = m.includes("saldo disponivel") ? "outro" : (m.includes("pix") || m.includes("transferencia bancaria")) ? "pix" : "cartao";
    }
    const ehPagamento = !ehSaque && !ehDevolucao;
    await inserirMovimentacao(sb, {
      conta_bancaria_id: conta, data_transacao: l.data_liberacao, descricao, valor: l.valor_liquido,
      tipo: l.valor_liquido < 0 ? "debito" : "credito", id_transacao_banco: l.id_operacao, hash_unico: hash,
      origem: "mp_release", tipo_meio: tipoMeio, referencia_pedido: l.codigo_referencia || null,
      classe: ehPagamento ? "recebivel_b2c" : null, classe_definida_por: ehPagamento ? "regra_p1" : null,
      contraparte_nome: ehSaque ? "FETELY COMERCIO IMPORTACAO E EXPORTACAO LTDA" : null,
      contraparte_documento: ehSaque ? cnpjProprio : null, fonte_importacao_id: impId,
    }, cont);
  }
}

/** Lançamento já gravado (para o enriquecimento, Fase 2). */
export interface MovExistente { id: string; id_transacao_banco: string; valor: number; referencia_pedido: string | null }
export interface PlanoEnriquecimento {
  atualizar: { id: string; referencia_pedido: string }[];
  casados: number; ja_tinham: number; sem_token_no_arquivo: number;
  sem_par: { id_operacao: string; data: string; valor: number }[];
  conflitos: { id: string; id_operacao: string; atual: string; arquivo: string }[];
}

/**
 * Fase 2 — enriquecer liberações antigas com EXTERNAL_REFERENCE. NUNCA cria lançamento:
 * casa pela mesma identidade da importação (id da operação + valor assinado), só preenche
 * referencia_pedido vazia; token diferente do gravado é conflito (não sobrescreve).
 */
export function enriquecerReferencias(libs: MpLiberacao[], existentes: MovExistente[]): PlanoEnriquecimento {
  const porChave = new Map<string, MovExistente>();
  for (const m of existentes) porChave.set(`${m.id_transacao_banco}|${Number(m.valor).toFixed(2)}`, m);
  const p: PlanoEnriquecimento = { atualizar: [], casados: 0, ja_tinham: 0, sem_token_no_arquivo: 0, sem_par: [], conflitos: [] };
  const vistos = new Set<string>();
  for (const l of libs) {
    if (!l.id_operacao) continue;
    const chave = `${l.id_operacao}|${l.valor_liquido.toFixed(2)}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const m = porChave.get(chave);
    if (!m) { p.sem_par.push({ id_operacao: l.id_operacao, data: l.data_liberacao, valor: l.valor_liquido }); continue; }
    p.casados++;
    const tok = l.codigo_referencia.trim();
    const atual = (m.referencia_pedido ?? "").trim();
    if (!tok) { p.sem_token_no_arquivo++; continue; }
    if (atual === tok) { p.ja_tinham++; continue; }
    if (atual) { p.conflitos.push({ id: m.id, id_operacao: l.id_operacao, atual, arquivo: tok }); continue; }
    p.atualizar.push({ id: m.id, referencia_pedido: tok });
  }
  return p;
}
