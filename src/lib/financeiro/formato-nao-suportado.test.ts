import { describe, it, expect } from "vitest";
import { ehFormatoNaoSuportado } from "./formato-nao-suportado";

describe("ehFormatoNaoSuportado", () => {
  it("arquivo sem fonte detectada pode ser guardado sem ler", () => {
    expect(ehFormatoNaoSuportado({ fonteDetectada: false, linhasLidas: 0, mensagem: "x" })).toBe(true);
  });
  it("cabeçalho não reconhecido pelo parser de fallback conta como formato", () => {
    expect(
      ehFormatoNaoSuportado({ fonteDetectada: true, linhasLidas: 0, mensagem: "Cabeçalho Safra Lançamentos não reconhecido" }),
    ).toBe(true);
  });
  it("erro de conta não identificada não é formato", () => {
    expect(
      ehFormatoNaoSuportado({ fonteDetectada: true, linhasLidas: 0, mensagem: "Conta bancária não identificada (fonte sem mapeamento)" }),
    ).toBe(false);
  });
  it("falha depois de ler linhas nunca vira guardado sem ler", () => {
    expect(ehFormatoNaoSuportado({ fonteDetectada: false, linhasLidas: 3, mensagem: "não reconhecido" })).toBe(false);
  });
});
