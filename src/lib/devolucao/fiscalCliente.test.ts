import { describe, expect, it } from "vitest";
import { estadoFiscalCliente } from "./fiscalCliente";
describe("NF do cliente no processo", () => {
  it("sugestão parcial impede outra emissão e pré-seleciona parcial", () => {
    expect(estadoFiscalCliente("ec0bc10a-281c-4445-b571-77d3cbecadd4", false, "parcial")).toEqual({ confirmar: true, ocultarGerar: true, grau: "parcial" });
  });
  it("sugestão total pré-seleciona total", () => {
    expect(estadoFiscalCliente("sugestao", false, "total").grau).toBe("total");
  });
  it("confirmada nunca propõe nova emissão nem nova confirmação", () => {
    expect(estadoFiscalCliente(null, true, null)).toEqual({ confirmar: false, ocultarGerar: true, grau: "total" });
  });
  it("sem NF do cliente não bloqueia emissão", () => {
    expect(estadoFiscalCliente(null, false, null).ocultarGerar).toBe(false);
  });
});