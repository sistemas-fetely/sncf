import { describe, expect, it } from "vitest";
import { podeAcionarPagamento } from "./acoesPagamento";

describe("ações de pagamento do pedido", () => {
  it.each(["aguardando_pagamento", "cobranca"])("permite ações em %s", (estagio) => {
    expect(podeAcionarPagamento(estagio)).toBe(true);
  });
  it.each(["pre_separacao", "em_separacao", "faturado", "entregue", "cancelado", "recebido"])("oculta ações em %s", (estagio) => {
    expect(podeAcionarPagamento(estagio)).toBe(false);
  });
  it("não oferece ações para pedido cancelado ainda em cobrança", () => {
    expect(podeAcionarPagamento("cobranca", "2026-10-15")).toBe(false);
  });
});