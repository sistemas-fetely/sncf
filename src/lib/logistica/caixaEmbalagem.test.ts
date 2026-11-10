import { describe, expect, it } from "vitest";
import { caixaOkParaModal, dimAvulsa, embalagemSemCaixa, erroPedeCorrigirEmbalagem } from "./caixaEmbalagem";

describe("caixa obrigatória no Correios", () => {
  it("Mesa usa exige_etiqueta_correios do cadastro sem depender do código", () => {
    expect(caixaOkParaModal("NOVO", null, null, true)).toBe(false);
    expect(caixaOkParaModal("NOVO", "CX-2", null, true)).toBe(true);
    expect(caixaOkParaModal("CORREIOS", null, null, false)).toBe(true);
  });
  it("Correios sem caixa nem avulsa não pode concluir", () => {
    expect(caixaOkParaModal("CORREIOS", null, null)).toBe(false);
  });
  it("Correios com caixa do cadastro pode", () => {
    expect(caixaOkParaModal("CORREIOS", "CX-2", null)).toBe(true);
  });
  it("Correios com caixa avulsa válida pode", () => {
    expect(caixaOkParaModal("CORREIOS", null, dimAvulsa({ c: "60", l: "20", a: "5" }))).toBe(true);
  });
  it("outro modal não exige caixa", () => {
    expect(caixaOkParaModal("MOTOBOY", null, null)).toBe(true);
  });
  it("avulsa exige as três medidas maiores que zero", () => {
    expect(dimAvulsa({ c: "60", l: "0", a: "5" })).toBeNull();
    expect(dimAvulsa({ c: "60,5", l: "20", a: "5" })).toEqual({ comprimento_cm: 60.5, largura_cm: 20, altura_cm: 5 });
  });
  it("reconhece o erro da edge que pede corrigir a embalagem", () => {
    expect(erroPedeCorrigirEmbalagem("SHP-1586: embalagem sem caixa registrada — corrija a embalagem")).toBe(true);
    expect(erroPedeCorrigirEmbalagem("Correios recusou a pré-postagem")).toBe(false);
  });
  it("embalagem Correios com caixa null é sem caixa", () => {
    expect(embalagemSemCaixa({ modal: "CORREIOS", caixa: null, caixa_dim: null })).toBe(true);
    expect(embalagemSemCaixa({ modal: "CORREIOS", caixa: null, caixa_dim: { comprimento_cm: 1 } })).toBe(false);
  });
});
