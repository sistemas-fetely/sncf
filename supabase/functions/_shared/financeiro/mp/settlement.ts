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

export function normalizarMpSettlement(rows: unknown[][]): MpSettlementTransacao[] {
  if (rows.length < 2) return [];
  const header = (rows[0] as unknown[]).map(normMp);
  const idx = (key: string) => header.findIndex((h) => h.includes(normMp(key)));
  const iDataAprov = idx("data de aprovacao");
  const iDataLib = idx("data de liberacao do dinheiro");
  const iIdTrans = idx("id da transacao no mercado pago");
  const iTipoMeio = idx("tipo de meio de pagamento");
  const iMeio = idx("meio de pagamento");
  const iValorBruto = idx("valor da compra");
  const iTarifa = idx("tarifas");
  const iValorLiq = idx("valor liquido da transacao");
  const iCodRef = idx("codigo de referencia");
  const iParcelas = idx("parcelas");
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
