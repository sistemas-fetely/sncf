import { expect, it } from "vitest";
import { resumirExtratoFornecedor, type MovimentoContaCorrente } from "./contaCorrenteExtrato";

it("preserva documentos e abatimentos com saldo acumulado na ordem do extrato", () => {
  const movimentos: MovimentoContaCorrente[] = [
    { cnpj: "123", data: "2026-09-01", tipo: "documento", descricao: "NF 1", valor: 100, ref: "nf-1" },
    { cnpj: "123", data: "2026-09-02", tipo: "abatimento", descricao: "Pagamento", valor: -40, ref: "pag-1" },
    { cnpj: "123", data: "2026-09-03", tipo: "documento", descricao: "NF 2", valor: 25, ref: "nf-2" },
  ];
  const resumo = resumirExtratoFornecedor(movimentos);
  expect(resumo.linhas.map((linha) => linha.saldo)).toEqual([100, 60, 85]);
  expect(resumo.linhas.map((linha) => linha.movimento)).toEqual(movimentos);
  expect(resumo.saldo).toBe(85);
  expect(resumo.documentos).toBe(2);
  expect(resumo.pagamentos).toBe(1);
});

it("extrato vazio não inventa movimentos ou saldo", () => {
  expect(resumirExtratoFornecedor([])).toEqual({ linhas: [], saldo: 0, documentos: 0, pagamentos: 0 });
});