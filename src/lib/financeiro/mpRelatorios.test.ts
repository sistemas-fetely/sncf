import { describe, expect, it } from "vitest";
import { lerCsvMp, normalizarMpRelease } from "../../../supabase/functions/_shared/financeiro/mp/release";
import { normalizarMpSettlement } from "../../../supabase/functions/_shared/financeiro/mp/settlement";

const CAB = "DATE;TRANSACTION_APPROVAL_DATE;SOURCE_ID;DESCRIPTION;NET_CREDIT_AMOUNT;NET_DEBIT_AMOUNT;PAYMENT_METHOD;EXTERNAL_REFERENCE;RECORD_TYPE;PAYOUT_BANK_ACCOUNT_NUMBER";
const csv = [
  CAB,
  "2026-09-15T00:00:00.000-03:00;;;;4090.71;0.00;;;initial_available_balance;",
  "2026-09-15T07:19:19.000-03:00;x;176647820554;payment;255.00;0.00;visa;rfTh;release;",
  "2026-09-15T09:12:35.000-03:00;x;179108298466;reserve_for_payout;0.00;4345.71;available_money;;release;",
  "2026-09-15T09:12:37.000-03:00;x;179108298466;payout;0.00;4345.71;available_money;;release;005804446",
  ";;;;907.54;0.00;;;total;",
].join("\n");

describe("Mercado Pago — CSV da API lido pela mesma regra do XLSX manual", () => {
  const l = normalizarMpRelease(lerCsvMp(csv));
  it("saldo inicial, reserva e total ficam fora", () => {
    expect(l.map((x) => x.id_operacao)).toEqual(["176647820554", "179108298466"]);
  });
  it("pagamento e saque em português, valor assinado e conta de destino", () => {
    expect(l[0]).toMatchObject({ descricao_mp: "Pagamento", meio_pagamento: "Visa", valor_liquido: 255, data_liberacao: "2026-09-15" });
    expect(l[1]).toMatchObject({ descricao_mp: "Saque", valor_liquido: -4345.71, conta_destino: "005804446" });
  });
  it("XLSX manual (cabeçalho em português) segue igual", () => {
    const rows = [
      ["DATA DE LIBERAÇÃO", "ID DA OPERAÇÃO", "DESCRIÇÃO", "VALOR LÍQUIDO CREDITADO", "VALOR LÍQUIDO DEBITADO", "MEIO DE PAGAMENTO", "TIPO DE REGISTRO"],
      ["2026-09-14T10:00:00", "1", "Pagamento", "10.5", "0", "Pix", "Liberações"],
      ["2026-09-14T10:00:00", "2", "Reserva para saque", "0", "10", "", "Liberações"],
    ];
    expect(normalizarMpRelease(rows).map((x) => x.id_operacao)).toEqual(["1"]);
  });
  it("settlement do agendamento: id, líquido e código de referência", () => {
    const rows = [["DATA DE APROVAÇÃO", "ID DA TRANSAÇÃO NO MERCADO PAGO", "TIPO DE MEIO DE PAGAMENTO", "VALOR LÍQUIDO DA TRANSAÇÃO", "DATA DE LIBERAÇÃO DO DINHEIRO", "CÓDIGO DE REFERÊNCIA"],
      ["2026-09-15T16:23:33.000-03:00", "178206631129", "Transferência bancária", "348.75", "2026-09-15T16:23:30.000-03:00", "rtBo"]];
    expect(normalizarMpSettlement(rows)[0]).toMatchObject({ id_transacao_mp: "178206631129", valor_liquido: 348.75, codigo_referencia: "rtBo", data_liberacao: "2026-09-15" });
  });
});
