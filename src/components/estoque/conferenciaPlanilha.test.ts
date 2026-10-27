import { describe, it, expect } from "vitest";
import { validarPlanilhaConferencia } from "./conferenciaPlanilha";

const itens = [
  { sku: "A1", enviado: 10, cod: "01000", nome: "X" },
  { sku: "B2", enviado: 5, cod: null, nome: "Y" },
];
const cab = [["Pedido", "PED-1"], ["Pedido ID", "p1"], ["Destino", "SITE-SP"], [], ["Código", "SKU", "Produto", "Enviado", "Recebido", "Avariado", "Diferença"]];

describe("validarPlanilhaConferencia", () => {
  it("aceita planilha correta e casa por código sem zero e por SKU", () => {
    const r = validarPlanilhaConferencia([...cab, [1000, "A1", "X", 10, 8, 1], [], ["", "B2", "Y", 5, 5, 0]], itens, "p1");
    expect(r.erros).toEqual([]);
    expect(r.recebido).toEqual({ A1: "8", B2: "5" });
    expect(r.avariado).toEqual({ A1: "1", B2: "0" });
  });
  it("recusa outro pedido", () => {
    const m = [...cab, ["01000", "A1", "", 10, 10, 0], ["", "B2", "", 5, 5, 0]];
    m[1] = ["Pedido ID", "p2"];
    expect(validarPlanilhaConferencia(m, itens, "p1").erros).toContain("Planilha é de outro pedido (p2)");
  });
  it("branco, decimal e negativo são erro; ausente e repetido também", () => {
    const r = validarPlanilhaConferencia([...cab, ["01000", "A1", "", 10, "", 0.5], ["01000", "A1", "", 10, 1, 0], ["9", "Z", "", 1, -1, 0]], itens, "p1");
    expect(r.erros).toContain("Linha 6: Recebido inválido (em branco)");
    expect(r.erros).toContain("Linha 6: Avariado inválido (0.5)");
    expect(r.erros).toContain("Item 01000 repetido (linhas 6 e 7)");
    expect(r.erros.some((e) => e.startsWith("Linha 8: Item não pertence"))).toBe(true);
    expect(r.erros).toContain("Item B2 ausente na planilha");
  });
  it("planilha cega: Avariado em branco vira 0, Recebido em branco continua erro", () => {
    const cabCega = [...cab.slice(0, 4), ["Código", "SKU", "Produto", "Recebido", "Avariado"]];
    const r = validarPlanilhaConferencia([...cabCega, ["01000", "A1", "X", 9, null], ["", "B2", "Y", null, null]], itens, "p1");
    expect(r.avariado).toEqual({ A1: "0", B2: "0" });
    expect(r.recebido).toEqual({ A1: "9" });
    expect(r.erros).toEqual(["Linha 7: Recebido inválido (em branco)"]);
  });
});
