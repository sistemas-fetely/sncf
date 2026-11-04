import { describe, expect, it } from "vitest";
import { interpretarListaColada } from "./colarListaItens";

const nf = [{ codigo: "LUM-01", quantidade: 10 }, { codigo: "CEL-22", quantidade: 4 }];

describe("interpretarListaColada", () => {
  it("casa código com Nº e descrição extras, case-insensitive", () => {
    const r = interpretarListaColada("Nº\tCódigo\tDescrição\tQtd\n1\tlum-01\tVela azul\t3", nf);
    expect(r.casados).toEqual({ "LUM-01": 3 });
    expect(r.naoEncontrados).toEqual([]);
  });
  it("sem qtd assume qtd cheia da NF", () => {
    expect(interpretarListaColada("CEL-22", nf).casados).toEqual({ "CEL-22": 4 });
  });
  it("qtd acima da NF não é aplicada", () => {
    const r = interpretarListaColada("CEL-22;5", nf);
    expect(r.casados).toEqual({});
    expect(r.acimaNf).toEqual([{ codigo: "CEL-22", qtd: 5, qtdNf: 4 }]);
  });
  it("código desconhecido vira não encontrado; total ignorado", () => {
    const r = interpretarListaColada("XYZ-9 2\nTotal 7", nf);
    expect(r.naoEncontrados).toEqual(["XYZ-9"]);
    expect(r.casados).toEqual({});
  });
});
