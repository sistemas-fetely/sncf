import { describe, expect, it } from "vitest";
import { divergeDaSugestao, podeTrocarCd, trocaCdValida } from "./b2c-cd";

describe("escolha e troca de CD B2C", () => {
  it("exige confirmação somente quando difere da sugestão da fila", () => {
    expect(divergeDaSugestao("XPM-SC", "SITE-SP")).toBe(true);
    expect(divergeDaSugestao("SITE-SP", "SITE-SP")).toBe(false);
    expect(divergeDaSugestao(null, "SITE-SP")).toBe(false);
  });
  it("oferece troca somente em pendente com CD escolhido", () => {
    expect(podeTrocarCd("pendente", "SITE-SP")).toBe(true);
    for (const status of ["aguardando_destino", "processando", "enviado", "erro", null]) {
      expect(podeTrocarCd(status, "SITE-SP")).toBe(false);
    }
    expect(podeTrocarCd("pendente", null)).toBe(false);
  });
  it("exige motivo e um CD diferente do atual", () => {
    expect(trocaCdValida("SITE-SP", "XPM-SC", "Entrada corrigida")).toBe(true);
    expect(trocaCdValida("SITE-SP", "XPM-SC", "  ")).toBe(false);
    expect(trocaCdValida("SITE-SP", "SITE-SP", "Entrada corrigida")).toBe(false);
    expect(trocaCdValida("SITE-SP", "", "Entrada corrigida")).toBe(false);
  });
});