import { describe, expect, it } from "vitest";
import { montar } from "./NascerProdutoNacionalDialog";

describe("payload da porta única de produto", () => {
  it("envia Nacional sem inner quando vazio, sem inventar quantidade", () => {
    expect(montar({ origem: "nacional", nome_comercial: "Vela", inner_qtd: "" })).toEqual({ origem: "nacional", nome_comercial: "Vela" });
  });
  it("envia Importado e a quantidade da caixa master", () => {
    expect(montar({ origem: "importado", inner_qtd: "24" })).toEqual({ origem: "importado", inner_qtd: 24 });
  });
  it("delega a recusa de importado sem inner ao banco", () => {
    expect(montar({ origem: "importado", inner_qtd: "" })).toEqual({ origem: "importado" });
  });
});