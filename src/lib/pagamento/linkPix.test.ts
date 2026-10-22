import { describe, it, expect, vi, afterEach } from "vitest";
import { urlPaginaPix } from "./linkPix";
import { PUBLIC_APP_URL, definirUrlPublicaDoBanco } from "@/lib/urls";

describe("urlPaginaPix", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("usa a origem pública, nunca a do navegador", () => {
    vi.stubGlobal("location", { ...window.location, origin: "http://localhost" });
    const url = urlPaginaPix("abc");
    expect(url.startsWith("http://localhost")).toBe(false);
    expect(url.startsWith(PUBLIC_APP_URL)).toBe(true);
    expect(url).toBe(`${PUBLIC_APP_URL}/pagar/abc`);
  });

  it("adota o valor de fn_url_publica sem barra final", () => {
    definirUrlPublicaDoBanco("https://exemplo.com.br/");
    expect(urlPaginaPix("abc")).toBe("https://exemplo.com.br/pagar/abc");
    definirUrlPublicaDoBanco(PUBLIC_APP_URL);
  });
});
