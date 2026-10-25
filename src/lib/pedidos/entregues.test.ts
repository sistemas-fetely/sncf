import { describe, expect, it } from "vitest";
import { esconderEntreguesNaLista } from "./entregues";

// Regra do Flávio (25/10/2026): toggle "Mostrar entregues" desligado esconde
// estágio 'entregue' da lista de Pedidos Site SP.
describe("esconderEntreguesNaLista", () => {
  it("toggle desligado, sem busca e sem filtro esconde entregues", () => {
    expect(
      esconderEntreguesNaLista({ mostrarEntregues: false, temBusca: false, filtroDeEntregue: false }),
    ).toBe(true);
  });

  it("busca preenchida acha entregue mesmo com toggle desligado", () => {
    expect(
      esconderEntreguesNaLista({ mostrarEntregues: false, temBusca: true, filtroDeEntregue: false }),
    ).toBe(false);
  });

  it("toggle ligado mostra entregues", () => {
    expect(
      esconderEntreguesNaLista({ mostrarEntregues: true, temBusca: false, filtroDeEntregue: false }),
    ).toBe(false);
  });

  it("filtro de entregue (card Entregue · 30 dias) mostra entregues", () => {
    expect(
      esconderEntreguesNaLista({ mostrarEntregues: false, temBusca: false, filtroDeEntregue: true }),
    ).toBe(false);
  });
});
