import { describe, expect, it } from "vitest";
import { codigosAposLote, etiquetaSncfASubstituir } from "./postagemAgencia";

describe("postagem na agência: bipe vence etiqueta SNCF", () => {
  it("com agência e bipe diferente, a etiqueta SNCF é substituída", () => {
    expect(etiquetaSncfASubstituir({ temAgencia: true, codigoSncf: "AE087871785BR", codigoBipado: "oy123456789br" })).toBe("AE087871785BR");
  });
  it("sem agência, nunca substitui (a trava do banco recusa)", () => {
    expect(etiquetaSncfASubstituir({ temAgencia: false, codigoSncf: "AE087871785BR", codigoBipado: "OY123456789BR" })).toBeNull();
  });
  it("bipe igual à etiqueta SNCF não cancela nada", () => {
    expect(etiquetaSncfASubstituir({ temAgencia: true, codigoSncf: "AP677139427BR", codigoBipado: " ap677139427br " })).toBeNull();
  });
  it("lote limpa só os códigos que despacharam", () => {
    expect(codigosAposLote({ a: "X1", b: "X2" }, [{ pedido_id: "a", ok: true }, { pedido_id: "b", ok: false }])).toEqual({ b: "X2" });
  });
});
