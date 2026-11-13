import { describe, expect, it } from "vitest";
import { rotuloMeioLink } from "./meioLink";

describe("rotuloMeioLink", () => {
  it("link PIX do Safra", () => expect(rotuloMeioLink("pix_link")).toBe("PIX pelo Safra"));
  it("PIX legado continua PIX", () => expect(rotuloMeioLink("pix")).toBe("PIX"));
  it("cartão e vazio caem em Cartão", () => {
    expect(rotuloMeioLink("cartao_link")).toBe("Cartão");
    expect(rotuloMeioLink(null)).toBe("Cartão");
  });
});
