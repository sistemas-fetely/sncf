import { describe, expect, it } from "vitest";
import { montarNascimentos, type LinhaPlanilha } from "./importar-planilha-cadastro";

const l = (linha: number, cod: string | null, celulas: Record<string, unknown>): LinhaPlanilha => ({ linha, cod, celulas, liberar: false });

describe("montarNascimentos", () => {
  it("cod existente na matriz enriquece; sem cod nasce livre", () => {
    const r = montarNascimentos([l(7, "02025", { nome_comercial: "A" }), l(8, null, { nome_comercial: "B" })], "m", new Set(["02025"]));
    expect(r.nascimentos.map((n) => n.linha)).toEqual([8]);
    expect(r.nascimentos[0].pinado).toBe(false);
  });
  it("cod inexistente na matriz nasce pinado com o código no payload", () => {
    const r = montarNascimentos([l(9, "03100", { nome_comercial: "C" })], "", new Set(["02025"]));
    expect(r.nascimentos[0].pinado).toBe(true);
    expect(r.nascimentos[0].payload.cod_cadastro).toBe("03100");
  });
  it("origem vazia = nacional", () => {
    expect(montarNascimentos([l(8, null, { nome_comercial: "B" })], "").nascimentos[0].payload.origem).toBe("nacional");
  });
  it("aceita importado e inner_qtd com vírgula", () => {
    const n = montarNascimentos([l(8, null, { nome_comercial: "B", origem: "Importado", inner_qtd: "12" })], "").nascimentos[0];
    expect(n.payload).toMatchObject({ origem: "importado", inner_qtd: 12 });
  });
  it("origem inválida vira erro", () => {
    expect(montarNascimentos([l(8, null, { nome_comercial: "B", origem: "china" })], "").erros).toHaveLength(1);
  });
});
