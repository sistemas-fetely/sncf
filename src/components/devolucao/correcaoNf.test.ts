import { describe, expect, it } from "vitest";
import { ordenarCorrecoes, prazoCancelamento, textoReenvio } from "./correcaoNf";

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
  it("texto do reenvio concluído traz a NF nova", () => {
    expect(textoReenvio("concluido", "000910", null)).toBe("Concluída — NF nova nº 000910");
  });
});
