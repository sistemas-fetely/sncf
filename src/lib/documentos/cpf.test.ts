import { describe, it, expect } from "vitest";
import { cpfValido, mascaraCpf } from "./cpf";
describe("cpfValido", () => {
  it("aceita CPF com DV correto", () => expect(cpfValido("529.982.247-25")).toBe(true));
  it("recusa DV errado", () => expect(cpfValido("52998224724")).toBe(false));
  it("recusa todos iguais", () => expect(cpfValido("11111111111")).toBe(false));
  it("recusa telefone no lugar do CPF", () => expect(cpfValido("11987654321")).toBe(false));
  it("recusa vazio", () => expect(cpfValido("")).toBe(false));
});
it("mascaraCpf", () => expect(mascaraCpf("52998224725")).toBe("529.982.247-25"));
