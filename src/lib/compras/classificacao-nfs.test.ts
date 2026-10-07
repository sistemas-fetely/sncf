import { describe, expect, it } from "vitest";
import {
  classeClassificacao,
  filtrarPorClassificacao,
  rotuloClassificacao,
} from "./classificacao-nfs";

const linhas = [
  { classificacao: "mercadoria" },
  { classificacao: "possivel" },
  { classificacao: "nao_mercadoria" },
  { classificacao: null },
];

describe("filtrarPorClassificacao", () => {
  it("esconde nao_mercadoria e a linha sem classificação no filtro padrão", () => {
    expect(filtrarPorClassificacao(linhas, false)).toEqual([
      { classificacao: "mercadoria" },
      { classificacao: "possivel" },
    ]);
  });

  it("devolve todas as linhas com mostrarTodas ligado", () => {
    expect(filtrarPorClassificacao(linhas, true)).toEqual(linhas);
  });
});

describe("rotuloClassificacao", () => {
  it("traduz os três valores da view", () => {
    expect(rotuloClassificacao("mercadoria")).toBe("Mercadoria");
    expect(rotuloClassificacao("possivel")).toBe("Possível mercadoria");
    expect(rotuloClassificacao("nao_mercadoria")).toBe("Não parece mercadoria");
  });

  it("mostra traço quando a view não classificou", () => {
    expect(rotuloClassificacao(null)).toBe("—");
  });
});

describe("classeClassificacao", () => {
  it("pinta mercadoria de verde, possível de âmbar e o resto de cinza", () => {
    expect(classeClassificacao("mercadoria")).toContain("text-success");
    expect(classeClassificacao("possivel")).toContain("text-warning-strong");
    expect(classeClassificacao("nao_mercadoria")).toContain("text-muted-foreground");
    expect(classeClassificacao(null)).toContain("text-muted-foreground");
  });
});
