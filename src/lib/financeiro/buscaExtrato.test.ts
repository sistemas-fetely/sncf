import { describe, expect, it } from "vitest";
import { filtroBuscaExtrato, valorBuscaExtrato } from "./buscaExtrato";

describe("busca do extrato", () => {
  it.each(["23,04", "-23,04", "23.04"])("busca %s por 23,04 sem sinal e com tolerância de um centavo", texto => {
    expect(valorBuscaExtrato(texto)).toBe(23.04);
    expect(filtroBuscaExtrato(texto)).toContain("and(valor_abs.gte.23.03,valor_abs.lte.23.05)");
    expect(filtroBuscaExtrato(texto)).toContain("descricao.ilike.");
  });
  it.each(["R$ 1.234,56", "1234,56"])("aceita %s com separador brasileiro", texto => {
    expect(valorBuscaExtrato(texto)).toBe(1234.56);
    expect(filtroBuscaExtrato(texto)).toContain("and(valor_abs.gte.1234.55,valor_abs.lte.1234.57)");
  });
  it("texto mantém descrição, nome, documento e referência sem filtro de valor", () => {
    expect(valorBuscaExtrato("SISPAG DARE")).toBeNull();
    expect(filtroBuscaExtrato("DARE")).toBe("descricao.ilike.%DARE%,contraparte_nome.ilike.%DARE%,contraparte_documento.ilike.%DARE%,referencia_pedido.ilike.%DARE%");
  });
  it.each(["", "abc23,04", "123.456.789-00", "46.379.400/0001-50", "23,04xyz"])("não interpreta %s como valor", texto => expect(valorBuscaExtrato(texto)).toBeNull());
  it("valor zero não produz limite inferior negativo", () => expect(filtroBuscaExtrato("0")).toContain("and(valor_abs.gte.0.00,valor_abs.lte.0.01)"));
});