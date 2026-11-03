import { describe, expect, it } from "vitest";
import { codigosAposLote, etiquetaSncfASubstituir, referenciaLoteCorreios } from "./postagemAgencia";

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

describe("referenciaLoteCorreios", () => {
  it("etiqueta SNCF viva sem agência despacha com o código gravado, sem bipe", () => {
    expect(referenciaLoteCorreios({ codigoSncf: "AP691267461BR", temAgencia: false, bipado: "" }))
      .toEqual({ exigeBipe: false, referencia: "AP691267461BR" });
  });
  it("postagem na agência continua exigindo o bipe", () => {
    expect(referenciaLoteCorreios({ codigoSncf: "AP691267461BR", temAgencia: true, bipado: " aa123 " }))
      .toEqual({ exigeBipe: true, referencia: "AA123" });
  });
  it("sem etiqueta SNCF exige o bipe", () => {
    expect(referenciaLoteCorreios({ codigoSncf: null, temAgencia: false, bipado: "" }).exigeBipe).toBe(true);
  });
});
