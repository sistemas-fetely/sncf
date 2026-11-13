import { describe, expect, it } from "vitest";
import { meioVD } from "./meioVD";

describe("meioVD", () => {
  it("maquininha continua maquininha (não vira cartão-link)", () => expect(meioVD("cartao_maquininha")).toBe("cartao_maquininha"));
  it("pix é pix", () => expect(meioVD("pix")).toBe("pix"));
  it("cartao e cartao_credito são link", () => { expect(meioVD("cartao")).toBe("cartao"); expect(meioVD("cartao_credito")).toBe("cartao"); });
});

describe("meioVD · PIX pelo Safra (13/11/2026)", () => {
  it("pix_safra é meio próprio, separado do PIX QR", () => {
    expect(meioVD("pix_safra")).toBe("pix_safra");
    expect(meioVD("pix")).toBe("pix");
  });
});
