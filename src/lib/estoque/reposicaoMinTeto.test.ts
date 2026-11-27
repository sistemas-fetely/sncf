import { describe, expect, it } from "vitest";
import { validarMinTeto } from "./reposicaoMinTeto";
describe("validarMinTeto", () => {
  it("teto menor que mínimo é recusado", () => expect(validarMinTeto(5, 3)).toMatch(/Teto/));
  it("negativo é recusado", () => expect(validarMinTeto(-1, 3)).toMatch(/≥ 0/));
  it("em massa aceita só um dos dois", () => expect(validarMinTeto(null, 4)).toBeNull());
  it("em massa exige pelo menos um", () => expect(validarMinTeto(null, null)).toMatch(/mínimo ou teto/));
  it("individual exige ambos", () => expect(validarMinTeto(2, null, { exigirAmbos: true })).toMatch(/mínimo e teto/));
  it("teto igual ao mínimo passa", () => expect(validarMinTeto(3, 3, { exigirAmbos: true })).toBeNull());
});
