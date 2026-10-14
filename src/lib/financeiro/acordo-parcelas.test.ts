import { describe, it, expect } from "vitest";
import { dividirSaldo, ajusteDoAcordo } from "./acordo-parcelas";

describe("acordo de renegociação", () => {
  it("divide em partes iguais com centavos de diferença na última", () => {
    const p = dividirSaldo(100, 3, "2026-11-01", 30);
    expect(p.map((x) => x.valor)).toEqual(["33.33", "33.33", "33.34"]);
    expect(p.map((x) => x.data_vencimento)).toEqual(["2026-11-01", "2026-12-01", "2026-12-31"]);
  });

  it("rotula o ajuste pela diferença entre soma e saldo", () => {
    expect(ajusteDoAcordo(100, 110)).toEqual({ valor: 10, rotulo: "Acréscimo" });
    expect(ajusteDoAcordo(100, 90)).toEqual({ valor: -10, rotulo: "Desconto" });
    expect(ajusteDoAcordo(100, 100).rotulo).toBe("Sem ajuste");
  });
});
