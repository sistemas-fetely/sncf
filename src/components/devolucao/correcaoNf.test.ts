import { describe, expect, it } from "vitest";
import { ordenarCorrecoes, prazoCancelamento, podeGerarNfSubstituta, ehCancelamentoComNf, type StatusNfSub } from "./correcaoNf";

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
});
