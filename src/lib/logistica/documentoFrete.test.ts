import { describe, expect, it } from "vitest";
import { cobradoTransp, divergenciaFatura, formatarDesvioCotacao } from "./documentoFrete";

describe("cobradoTransp", () => {
  it("usa a fatura quando ela existe", () => {
    expect(cobradoTransp({ valor_doc: 18.4, valor_fatura: 21.9 })).toBe(21.9);
  });

  it("cai no documento quando não há fatura", () => {
    expect(cobradoTransp({ valor_doc: 18.4, valor_fatura: null })).toBe(18.4);
  });

  it("não confunde fatura zerada com ausente", () => {
    expect(cobradoTransp({ valor_doc: 18.4, valor_fatura: 0 })).toBe(0);
  });

  it("devolve null quando nenhum valor existe", () => {
    expect(cobradoTransp({ valor_doc: null, valor_fatura: null })).toBeNull();
  });
});

describe("divergenciaFatura", () => {
  it("alerta quando fatura e CT-e diferem mais de R$ 0,01", () => {
    expect(divergenciaFatura({ valor_doc: 18.4, valor_fatura: 21.9 })).toEqual({ valor_cte: 18.4, valor_fatura: 21.9 });
  });

  it("não alerta na diferença de um centavo", () => {
    expect(divergenciaFatura({ valor_doc: 18.4, valor_fatura: 18.41 })).toBeNull();
  });

  it("não alerta sem fatura", () => {
    expect(divergenciaFatura({ valor_doc: 18.4, valor_fatura: null })).toBeNull();
  });

  it("não alerta sem documento", () => {
    expect(divergenciaFatura({ valor_doc: null, valor_fatura: 21.9 })).toBeNull();
  });
});

describe("formatarDesvioCotacao", () => {
  it("mostra o sinal e uma casa decimal", () => {
    expect(formatarDesvioCotacao(59.1)).toBe("+59,1%");
    expect(formatarDesvioCotacao(-13.5)).toBe("−13,5%");
    expect(formatarDesvioCotacao(8.24)).toBe("+8,2%");
  });

  it("zero fica sem sinal", () => {
    expect(formatarDesvioCotacao(0)).toBe("0,0%");
    expect(formatarDesvioCotacao(-0.04)).toBe("0,0%");
  });

  it("sem cotação não inventa desvio", () => {
    expect(formatarDesvioCotacao(null)).toBeNull();
  });
});
