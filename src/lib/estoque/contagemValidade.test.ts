import { describe, expect, it } from "vitest";
import { contagemNoPrazo, diasDesdeContagem, separarContagens, type UltimaContagem } from "./contagemValidade";

const hoje = "2026-11-09";
describe("validade da contagem", () => {
  it("nunca contado fica pendente", () => {
    expect(contagemNoPrazo(null, 90, hoje)).toBe(false);
  });
  it("mais de 90 dias está vencido", () => {
    expect(diasDesdeContagem("2026-08-10", hoje)).toBe(91);
    expect(contagemNoPrazo("2026-08-10", 90, hoje)).toBe(false);
  });
  it("90 dias exatos ainda estão no prazo", () => {
    expect(contagemNoPrazo("2026-08-11", 90, hoje)).toBe(true);
  });
  it("usa o parâmetro recebido, não um prazo fixo", () => {
    expect(contagemNoPrazo("2026-11-01", 7, hoje)).toBe(false);
    expect(contagemNoPrazo("2026-11-01", 8, hoje)).toBe(true);
  });
  it("calcula o dia em Brasília", () => {
    expect(diasDesdeContagem("2026-08-12T01:00:00Z", hoje)).toBe(90);
  });
  it("ordena nunca contado e mais antigo; exclui sessão só dos pendentes", () => {
    const u = (sku: string, em: string): UltimaContagem => ({ sku, em, qtd: 4, criadoPor: null, quem: null });
    const ultimas = new Map([u("A", "2026-07-01"), u("B", "2026-06-01"), u("C", "2026-11-01"), u("D", "2026-11-09")].map((x) => [x.sku, x]));
    const produtos = ["A", "B", "C", "D", "E", "F"].map((sku) => ({ sku }));
    const r = separarContagens(produtos, ultimas, new Set(["F", "D"]), 90, hoje);
    expect(r.pendentes.map((x) => x.sku)).toEqual(["E", "B", "A"]);
    expect(r.noPrazo.map((x) => x.sku)).toEqual(["D", "C"]);
  });
});