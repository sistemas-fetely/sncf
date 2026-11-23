import { describe, expect, it } from "vitest";
import { argsEscolhaCdVD, controlesCdLinhaVD, podeConfirmarCdVD, podeDesfazerCdVD } from "./escolherCdVD";

describe("Escolha de CD VD", () => {
  it("mostra escolha na linha só na etapa escolher_cd com edição", () => {
    expect(controlesCdLinhaVD("escolher_cd", true, true)).toEqual({ mostrarEscolha: true, mostrarTroca: false });
    expect(controlesCdLinhaVD("descendo_bling", true, true)).toEqual({ mostrarEscolha: false, mostrarTroca: true });
    expect(controlesCdLinhaVD("escolher_cd", false, true)).toEqual({ mostrarEscolha: false, mostrarTroca: false });
    expect(controlesCdLinhaVD(null, true, false)).toEqual({ mostrarEscolha: false, mostrarTroca: false });
  });
  it("esconde Trocar CD em escolher_cd e preserva a elegibilidade nas demais etapas", () => {
    expect(controlesCdLinhaVD("escolher_cd", true, true).mostrarTroca).toBe(false);
    expect(controlesCdLinhaVD("aguardando_nf", true, true).mostrarTroca).toBe(true);
    expect(controlesCdLinhaVD("aguardando_nf", true, false).mostrarTroca).toBe(false);
    expect(controlesCdLinhaVD("aguardando_nf", false, true).mostrarTroca).toBe(false);
  });
  it("Site SP não exige transportadora nem motivo", () => {
    expect(podeConfirmarCdVD("SITE-SP", null, true, false)).toBe(true);
    expect(argsEscolhaCdVD("pedido", "SITE-SP", " ", "outra")).toEqual({ p_pedido_id: "pedido", p_centro_codigo: "SITE-SP", p_motivo: null, p_transportadora_id: null });
  });
  it("XPM exige transportadora de cotação válida", () => {
    expect(podeConfirmarCdVD("XPM-SC", null, true, true)).toBe(false);
    expect(podeConfirmarCdVD("XPM-SC", "carrier", true, false)).toBe(false);
    expect(podeConfirmarCdVD("XPM-SC", "carrier", true, true)).toBe(true);
    expect(argsEscolhaCdVD("pedido", "XPM-SC", " operação ", "carrier").p_motivo).toBe("operação");
  });
  it("sem permissão não confirma", () => expect(podeConfirmarCdVD("SITE-SP", null, false, true)).toBe(false));
  it("sem destino válido não confirma", () => expect(podeConfirmarCdVD("", null, true, true)).toBe(false));
  it("desfaz somente pendente, descendo e sem número Bling", () => {
    expect(podeDesfazerCdVD("descendo_bling", "pendente", null)).toBe(true);
    expect(podeDesfazerCdVD("escolher_cd", "pendente", null)).toBe(false);
    expect(podeDesfazerCdVD("descendo_bling", "enviado", null)).toBe(false);
    expect(podeDesfazerCdVD("descendo_bling", "pendente", "123")).toBe(false);
  });
});