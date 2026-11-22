import { describe, expect, it } from "vitest";
import {
  FILTROS_CANAL_PASSO,
  passoNoCanal,
  rotuloCanal,
  rotuloTrecho,
} from "./rotulosPasso";

describe("rótulos de trecho do passo", () => {
  it("traduz os três trechos novos da NF", () => {
    expect(rotuloTrecho("antes_nf")).toBe("Antes da NF");
    expect(rotuloTrecho("nf_nao_expedida")).toBe("NF emitida, não saiu");
    expect(rotuloTrecho("correcao_nf")).toBe("Correção de NF");
  });

  it("mantém os três rótulos que já existiam", () => {
    expect(rotuloTrecho("entrega_falhou")).toBe("Entrega falhou");
    expect(rotuloTrecho("retornando")).toBe("Retornando");
    expect(rotuloTrecho("entregue_devolucao")).toBe("Entregue: cliente devolve");
  });

  it("mostra o próprio texto quando o código não é conhecido", () => {
    expect(rotuloTrecho("conferir_lacre")).toBe("conferir_lacre");
    expect(rotuloTrecho(null)).toBeNull();
    expect(rotuloTrecho(undefined)).toBeNull();
  });
});

describe("rótulos de canal do passo", () => {
  it("escreve todos os canais por extenso e os demais como na tela", () => {
    expect(rotuloCanal("todos")).toBe("Todos os canais");
    expect(rotuloCanal("site_sp")).toBe("Site SP");
    expect(rotuloCanal("b2b")).toBe("B2B");
    expect(rotuloCanal("b2c")).toBe("B2C");
  });

  it("mantém maiúsculas para canal desconhecido e não inventa rótulo vazio", () => {
    expect(rotuloCanal("marketplace")).toBe("MARKETPLACE");
    expect(rotuloCanal(null)).toBeNull();
  });
});

describe("filtro de canal na grade de passos", () => {
  it("mostra na ordem pedida: Todos · B2C · B2B · Site SP · Todos os canais", () => {
    expect(FILTROS_CANAL_PASSO.map((f) => f.rotulo)).toEqual([
      "Todos",
      "B2C",
      "B2B",
      "Site SP",
      "Todos os canais",
    ]);
  });

  it("sem filtro mostra tudo, inclusive passo sem canal", () => {
    expect(passoNoCanal("b2c", "sem_filtro")).toBe(true);
    expect(passoNoCanal("todos", "sem_filtro")).toBe(true);
    expect(passoNoCanal(null, "sem_filtro")).toBe(true);
  });

  it("filtro de canal mostra só o canal dele e esconde passo sem canal", () => {
    expect(passoNoCanal("b2c", "b2c")).toBe(true);
    expect(passoNoCanal("b2b", "b2c")).toBe(false);
    expect(passoNoCanal(null, "b2c")).toBe(false);
  });

  it("\"Todos os canais\" é o canal todos, não o filtro desligado", () => {
    expect(passoNoCanal("todos", "todos")).toBe(true);
    expect(passoNoCanal("b2c", "todos")).toBe(false);
    expect(passoNoCanal(null, "todos")).toBe(false);
  });
});
