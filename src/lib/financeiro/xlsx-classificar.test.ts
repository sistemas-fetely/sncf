import { describe, it, expect } from "vitest";
import { classificarXlsx } from "./xlsx-classificar";

describe("classificarXlsx — cabeçalho confirma o leitor", () => {
  it("account_statement do Mercado Pago não vira safra_lancamentos", () => {
    const rows = [
      ["initial_balance", "credits", "debits", "final_balance"],
      ["4.966,91", "38.659,46", "-33.787,74", "9.838,63"],
      [],
      ["release_date", "transaction_type", "reference_id", "transaction_net_amount", "partial_balance"],
    ];
    expect(classificarXlsx(rows)).toBeNull();
  });
  it("estoque contábil do SNCF é recusado como relatório do SNCF", () => {
    expect(classificarXlsx([["sku", "produto", "centro", "quantidade", "custo unitario", "valor total"]])).toBe("relatorio_sncf");
  });
  it("resumo mensal CFO do SNCF é recusado como relatório do SNCF", () => {
    expect(classificarXlsx([["RESUMO MENSAL"], ["Fetely Comércio"]])).toBe("relatorio_sncf");
  });
  it("relatório collection do MP não é aceito como settlement", () => {
    expect(classificarXlsx([["Data da compra (date_created)", "Data de liberação do dinheiro (date_released)", "Valor do produto (transaction_amount)"]])).toBeNull();
  });
  it("settlement v2 com id da transação continua aceito", () => {
    expect(classificarXlsx([["DATA DE APROVAÇÃO", "DATA DE LIBERAÇÃO DO DINHEIRO", "ID DA TRANSAÇÃO NO MERCADO PAGO"]])).toBe("mp_settlement");
  });
  it("extrato Safra com status e valor continua aceito", () => {
    expect(classificarXlsx([["Data e hora", "Status", "Valor (R$)"]])).toBe("safra_lancamentos");
  });
});
