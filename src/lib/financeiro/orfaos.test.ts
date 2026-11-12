import { expect, it } from "vitest";
import { motivoOrfaoValido, filtrarOrfaos } from "./orfaos";
import type { OrfaoEntrada } from "@/hooks/financeiro/useConciliacaoOrfaos";

it("exige classe e motivo de pelo menos cinco caracteres após trim", () => {
  expect(motivoOrfaoValido("aporte", " 1234 ")).toBe(false);
  expect(motivoOrfaoValido("aporte", " 12345 ")).toBe(true);
  expect(motivoOrfaoValido("", "12345")).toBe(false);
});

const linhas = [{ movimentacao_id: "a", contraparte_nome: "José", contraparte_documento: "12345678901", valor: 1234.56, conta: "Safra" }, { movimentacao_id: "b", contraparte_nome: "Maria", valor: 0, conta: "Itaú" }] as OrfaoEntrada[];
it("busca nome sem distinção de caixa, documento formatado e valor BRL", () => {
  for (const termo of ["JOSÉ", "123.456.789-01", "1.234,56", "R$ 1.234,56"]) {
    expect(filtrarOrfaos(linhas, termo, "todas").map(o => o.movimentacao_id)).toEqual(["a"]);
  }
  expect(filtrarOrfaos(linhas, "", "Itaú").map(o => o.movimentacao_id)).toEqual(["b"]);
  expect(filtrarOrfaos(linhas, "JOSÉ", "Itaú")).toEqual([]);
});