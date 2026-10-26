import { describe, expect, it } from "vitest";
import { pedidoDividido, remessasAtivas } from "./remessasDivididas";

describe("remessasDivididas", () => {
  it("conta como ativa toda remessa com status ≠ cancelada", () => {
    expect(
      remessasAtivas([
        { status: "pronta_para_envio" },
        { status: "cancelada" },
        { status: "pronta_para_envio" },
      ]),
    ).toHaveLength(2);
  });

  it("aceita lista nula ou vazia sem erro", () => {
    expect(remessasAtivas(null)).toHaveLength(0);
    expect(remessasAtivas([])).toHaveLength(0);
  });

  it("pedido dividido: 2+ remessas ativas → true", () => {
    expect(
      pedidoDividido([
        { status: "pronta_para_envio" },
        { status: "pronta_para_envio" },
      ]),
    ).toBe(true);
  });

  it("uma remessa ativa (adotável) → false — envio geral continua", () => {
    expect(pedidoDividido([{ status: "pronta_para_envio" }])).toBe(false);
    expect(pedidoDividido([{ status: "pronta_para_envio" }, { status: "cancelada" }])).toBe(false);
  });

  it("só canceladas não divide o pedido", () => {
    expect(pedidoDividido([{ status: "cancelada" }, { status: "cancelada" }])).toBe(false);
  });
});
