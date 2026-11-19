import { expect, it } from "vitest";
import { pagamentoSocioDisponivel, precoItemSocio } from "./contaCorrenteSocio";
it("conta corrente somente para regime_socio true", () => {
  expect(pagamentoSocioDisponivel(true)).toBe(true);
  expect(pagamentoSocioDisponivel(false)).toBe(false);
  expect(pagamentoSocioDisponivel(null)).toBe(false);
});
it("desconto sócio 25% sobre varejo ou promocional", () => {
  expect(precoItemSocio(100)).toBe(75);
  expect(precoItemSocio(100, 80)).toBe(60);
  expect(precoItemSocio(100, 0)).toBe(0);
});