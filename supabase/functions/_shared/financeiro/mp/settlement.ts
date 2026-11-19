/**
 * Mercado Pago — Settlement (todas as transações). Versão ÚNICA: tela (XLSX manual) e
 * edge `mp-relatorios` (XLSX do agendamento). Settlement só ENRIQUECE (fn_extrato_enriquecer).
 */
import type { ContagemImportacao } from "../contagem-importacao.ts";
import { isoMp, normMp, numMp } from "./release.ts";

// deno-lint-ignore no-explicit-any
type Client = any;

export interface MpSettlementTransacao {
  data_aprovacao: string;
  data_liberacao: string;
  id_transacao_mp: string;
  tipo_meio_pagamento: string;
  meio_pagamento: string;
  valor_bruto: number;
  tarifa: number;
  valor_liquido: number;
  codigo_referencia: string;
  parcelas: number;
  origem: "mp_settlement";
}

/** Cabeçalho do CSV da API (códigos em inglês) — o XLSX manual vem com títulos em português. */
function ehCsvIngles(header: string[]): boolean {
  return header.includes("source_id") && header.includes("transaction_amount");
}

/** Lança erro quando há linhas de dados mas a coluna de identificação não existe em nenhum formato. */
function exigirIdentificacao(rows: unknown[][], iId: number) {
  if (iId >= 0) return;
  const temDados = rows.slice(1).some((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== ""));
  if (!temDados) return;
  const primeiras = (rows[0] as unknown[]).slice(0, 6).map((c) => String(c ?? "").trim()).join(", ");
  throw new Error(`Arquivo de vendas com colunas não reconhecidas: ${primeiras}`);
}

export function normalizarMpSettlement(rows: unknown[][]): MpSettlementTransacao[] {
  if (rows.length < 2) return [];
  const header = (rows[0] as unknown[]).map(normMp);
  const csv = ehCsvIngles(header);
  const idx = (pt: string, en: string) => csv ? header.indexOf(en) : header.findIndex((h) => h.includes(normMp(pt)));
  const iDataAprov = idx("data de aprovacao", "transaction_date");
  const iDataLib = idx("data de liberacao do dinheiro", "money_release_date");
  const iIdTrans = idx("id da transacao no mercado pago", "source_id");
  const iTipoMeio = idx("tipo de meio de pagamento", "payment_method_type");
  const iMeio = idx("meio de pagamento", "payment_method");
  const iValorBruto = idx("valor da compra", "transaction_amount");
  const iTarifa = idx("tarifas", "fee_amount");
  const iValorLiq = idx("valor liquido da transacao", "settlement_net_amount");
  const iCodRef = idx("codigo de referencia", "external_reference");
  const iParcelas = idx("parcelas", "installments");
  exigirIdentificacao(rows, iIdTrans);
  const out: MpSettlementTransacao[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    if (!row || !row[iIdTrans]) continue;
    out.push({
      data_aprovacao: isoMp(row[iDataAprov]),
      data_liberacao: isoMp(row[iDataLib]),
      id_transacao_mp: String(row[iIdTrans] ?? ""),
      tipo_meio_pagamento: String(row[iTipoMeio] ?? ""),
      meio_pagamento: String(row[iMeio] ?? ""),
      valor_bruto: numMp(row[iValorBruto]),
      tarifa: Math.abs(numMp(row[iTarifa])),
      valor_liquido: numMp(row[iValorLiq]),
      codigo_referencia: String(row[iCodRef] ?? ""),
      parcelas: parseInt(String(row[iParcelas] ?? "1"), 10) || 1,
      origem: "mp_settlement",
    });
  }
  return out;
}

/** Colunas do CSV → chaves de fn_mp_venda_marketplace_registrar (valores como texto). */
const MAPA_MARKETPLACE: Record<string, string> = {
  source_id: "SOURCE_ID", tipo_transacao: "TRANSACTION_TYPE", order_id: "ORDER_ID", pack_id: "PACK_ID",
  external_reference: "EXTERNAL_REFERENCE", purchase_id: "PURCHASE_ID", shipping_id: "SHIPPING_ID",
  data_venda: "TRANSACTION_DATE", valor_bruto: "TRANSACTION_AMOUNT", tarifa_total: "FEE_AMOUNT",
  comissao: "MKP_FEE_AMOUNT", taxa_financiamento: "FINANCING_FEE_AMOUNT", frete: "SHIPPING_FEE_AMOUNT",
  impostos: "TAXES_AMOUNT", cupom: "COUPON_AMOUNT", valor_liquido: "SETTLEMENT_NET_AMOUNT",
  data_liberacao_prevista: "MONEY_RELEASE_DATE", liberado: "IS_RELEASED", meio_pagamento: "PAYMENT_METHOD",
  tipo_meio_pagamento: "PAYMENT_METHOD_TYPE", parcelas: "INSTALLMENTS", sku: "PRODUCT_SKU", descricao_item: "SALE_DETAIL",
};

/** Todas as linhas de dados do CSV de vendas (qualquer TRANSACTION_TYPE) no formato da RPC. */
export function linhasVendaMarketplace(rows: unknown[][]): Record<string, unknown>[] {
  if (rows.length < 2) return [];
  const cols = (rows[0] as unknown[]).map((c) => String(c ?? "").trim().toUpperCase());
  const iId = cols.indexOf("SOURCE_ID");
  exigirIdentificacao(rows, iId);
  const out: Record<string, unknown>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    if (!row || String(row[iId] ?? "").trim() === "") continue;
    const raw: Record<string, string> = {};
    cols.forEach((c, i) => { raw[c] = row[i] == null ? "" : String(row[i]); });
    const linha: Record<string, unknown> = {};
    for (const [chave, col] of Object.entries(MAPA_MARKETPLACE)) {
      const v = raw[col];
      linha[chave] = v === undefined || v === "" ? null : v;
    }
    linha.raw = raw;
    out.push(linha);
  }
  return out;
}

export async function aplicarMpSettlement(sb: Client, conta: string, transacoes: MpSettlementTransacao[], cont: ContagemImportacao): Promise<void> {
  for (const t of transacoes) {
    if (!t.id_transacao_mp) { cont.ignorar("sem_identificador"); continue; }
    const tipoMeio = t.tipo_meio_pagamento.toLowerCase().includes("bancaria") ? "pix" : "cartao";
    const { data: alvoId, error } = await sb.rpc("fn_extrato_enriquecer", {
      p_conta: conta,
      p_data: t.data_liberacao || t.data_aprovacao,
      p_valor: t.valor_liquido,
      p_contraparte_nome: `MP ${t.meio_pagamento.toUpperCase()}`.trim(),
      p_contraparte_documento: null,
      p_referencia_pedido: t.codigo_referencia || null,
      p_tipo_meio: tipoMeio,
      p_classe: null,
    });
    if (error) throw error;
    if (alvoId) cont.enriquecer(); else cont.ignorar("sem_par_no_extrato");
  }
}
