import { describe, expect, it } from "vitest";
import { ordenarCorrecoes, prazoCancelamento, podeGerarNfSubstituta, ehCancelamentoComNf, podeCorrigirNf, ESTAGIOS_CORRIGIR_NF, type StatusNfSub } from "./correcaoNf";

describe("correções de NF", () => {
  it("ordena abertas primeiro e prazo mais próximo no topo", () => {
    const xs = [
      { id: "concluida", aberta: false, prazo: "2026-10-27T10:00:00Z", criado_em: "2026-10-27T00:00:00Z" },
      { id: "sem-prazo", aberta: true, prazo: null, criado_em: "2026-10-27T00:00:00Z" },
      { id: "prazo-tarde", aberta: true, prazo: "2026-10-28T12:00:00Z", criado_em: "2026-10-20T00:00:00Z" },
      { id: "prazo-cedo", aberta: true, prazo: "2026-10-28T08:00:00Z", criado_em: "2026-10-20T00:00:00Z" },
    ];
    expect(ordenarCorrecoes(xs).map((x) => x.id)).toEqual(["prazo-cedo", "prazo-tarde", "sem-prazo", "concluida"]);
  });
  it("prazo de cancelamento é 24h após a emissão, só no caminho cancelar_nf", () => {
    expect(prazoCancelamento("cancelar_nf", { emitida_em: "2026-10-27T10:00:00Z" })).toBe("2026-10-28T10:00:00.000Z");
    expect(prazoCancelamento("nf_devolucao", { emitida_em: "2026-10-27T10:00:00Z" })).toBeNull();
  });
  it("permite gerar somente após anulação/cancelamento da original", () => {
    expect(podeGerarNfSubstituta(true, null, false)).toBe(true);
    expect(podeGerarNfSubstituta(false, null, false)).toBe(false);
  });
  it("permite retentar erro, mas bloqueia gerando/rascunho/autorizada", () => {
    expect(podeGerarNfSubstituta(true, "erro", false)).toBe(true);
    for (const st of ["gerando", "rascunho", "autorizada"] as StatusNfSub[]) expect(podeGerarNfSubstituta(true, st, false)).toBe(false);
  });
  it("não gera em correção encerrada", () => {
    expect(podeGerarNfSubstituta(true, null, true)).toBe(false);
    expect(podeGerarNfSubstituta(true, "erro", true)).toBe(false);
  });
  it("correção refaturar não é cancelamento com NF", () => {
    expect(ehCancelamentoComNf("refaturar")).toBe(false);
    expect(ehCancelamentoComNf("devolucao")).toBe(true);
    expect(ehCancelamentoComNf(null)).toBe(false);
  });
  it("B2B e venda direta são elegíveis nos estágios com NF", () => {
    expect(podeCorrigirNf({ canal: "B2B", estagio: "faturado" })).toBe(true);
    expect(podeCorrigirNf({ canal: "B2C", origem: "venda_direta", estagio: "pre_separacao" })).toBe(true);
    expect(podeCorrigirNf({ canal: "B2C", origem: "venda_direta", estagio: "em_separacao" })).toBe(true);
    expect(podeCorrigirNf({ canal: "B2C", origem: "venda_direta", estagio: "em_transporte" })).toBe(true);
    expect(podeCorrigirNf({ canal: "B2C", origem: "venda_direta", estagio: "entregue" })).toBe(true);
  });
  it("B2C fora da venda direta, cancelado e estágio sem NF ficam de fora", () => {
    expect(podeCorrigirNf({ canal: "B2C", estagio: "faturado" })).toBe(false);
    expect(podeCorrigirNf({ canal: "B2C", origem: "shopify", estagio: "faturado" })).toBe(false);
    expect(podeCorrigirNf({ canal: "B2B", estagio: "cancelado" })).toBe(false);
    expect(podeCorrigirNf({ canal: "B2B", estagio: "entregue", cancelado_em: "2026-11-09T00:00:00Z" })).toBe(false);
    expect(podeCorrigirNf({ canal: "B2C", origem: "venda_direta", estagio: "aguardando_pagamento" })).toBe(false);
    expect(podeCorrigirNf({})).toBe(false);
  });
  it("estágios aceitos na correção de NF incluem pre_separacao e em_separacao", () => {
    expect(ESTAGIOS_CORRIGIR_NF).toEqual(["faturado", "pre_separacao", "em_separacao", "em_transporte", "entregue"]);
  });
});
