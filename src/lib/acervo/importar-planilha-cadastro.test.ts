import { describe, expect, it } from "vitest";
import { montarNascimentos, type LinhaPlanilha } from "./importar-planilha-cadastro";

const l = (linha: number, cod: string | null, celulas: Record<string, unknown>): LinhaPlanilha => ({ linha, cod, celulas, liberar: false });

describe("montarNascimentos", () => {
  it("só linhas sem cod_cadastro nascem", () => {
    const r = montarNascimentos([l(7, "02025", { nome_comercial: "A" }), l(8, null, { nome_comercial: "B" })], "m");
    expect(r.nascimentos.map((n) => n.linha)).toEqual([8]);
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
