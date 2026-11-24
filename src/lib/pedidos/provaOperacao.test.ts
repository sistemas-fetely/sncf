import { describe, expect, it } from "vitest";
import { mostrarProvaOperacao } from "./provaOperacao";

describe("prova de pagamento na operação", () => {
  it("oculta a prova quando o pedido está liberado", () => {
    expect(mostrarProvaOperacao({ liberado: true })).toBe(false);
  });
  it("mostra a prova quando o pedido não está liberado", () => {
    expect(mostrarProvaOperacao({ liberado: false })).toBe(true);
  });
  it("não inventa veredito enquanto a liberação está ausente", () => {
    expect(mostrarProvaOperacao(undefined)).toBe(false);
    expect(mostrarProvaOperacao(null)).toBe(false);
  });
});