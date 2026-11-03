import { describe, it, expect } from "vitest";
import { caminhoOriginalBanco, nomeSeguro, sha256Hex } from "./arquivoOriginal";

describe("arquivo original bancário", () => {
  it("monta o caminho em bancos/<AAAA-MM>/<importação>/<nome>", () => {
    expect(caminhoOriginalBanco("abc", "Extrato Itaú 10/2026.ofx", new Date(2026, 10, 3))).toBe(
      "bancos/2026-11/abc/Extrato_Itau_10_2026.ofx",
    );
  });
  it("nome vazio vira 'arquivo'", () => {
    expect(nomeSeguro("ççç")).toBe("ccc");
    expect(nomeSeguro("***")).toBe("arquivo");
  });
  it("sha256 em hexadecimal com 64 caracteres", async () => {
    const h = await sha256Hex(new TextEncoder().encode("abc").buffer as ArrayBuffer);
    expect(h).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
