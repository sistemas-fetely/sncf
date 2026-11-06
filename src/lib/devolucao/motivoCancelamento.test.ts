import { describe, expect, it } from "vitest";
import { textoMotivoCancelamento, usaMotivosTransferencia } from "./motivoCancelamento";

describe("motivos de cancelamento por canal", () => {
  it("usa a dimensão de transferência para o canal interno do orquestrador", () => {
    expect(usaMotivosTransferencia({ canal: "interno" })).toBe(true);
    expect(usaMotivosTransferencia({ canal_devolucao: "interno" })).toBe(true);
  });
  it.each(["b2b", "b2c", "site_sp"])("preserva a lista comercial para %s", (canal) => {
    expect(usaMotivosTransferencia({ canal_devolucao: canal })).toBe(false);
    expect(textoMotivoCancelamento(false, "Rótulo", "  Observação livre  ")).toBe("Observação livre");
  });
  it("envia o rótulo da transferência junto da observação livre", () => {
    expect(textoMotivoCancelamento(true, "Destino incorreto", "  Teste de prévia  ")).toBe("Destino incorreto — Teste de prévia");
  });
});