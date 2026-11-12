import { describe, expect, it } from "vitest";
import { camposEnderecoEntrega, cepEntregaDiferente, motivoCorrecaoPreenchido, podeExibirCorrecaoEndereco } from "./enderecoEntregaVD";

const pedido = { modal: "pac", endereco_entrega: { cep: "01310000" }, estagio: "separacao" };
describe("correção do endereço VD: apresentação", () => {
  it("exibe em pedido com endereço e não em retirada ou sem endereço", () => {
    expect(podeExibirCorrecaoEndereco(pedido)).toBe(true);
    expect(podeExibirCorrecaoEndereco({ ...pedido, modal: "retirada" })).toBe(false);
    expect(podeExibirCorrecaoEndereco({ ...pedido, endereco_entrega: null })).toBe(false);
    expect(podeExibirCorrecaoEndereco({ ...pedido, endereco_entrega: {} })).toBe(false);
  });
  it.each(["cancelado", "entregue", "encerrado", "devolvido"])("oculta em %s", (estagio) => {
    expect(podeExibirCorrecaoEndereco({ ...pedido, estagio })).toBe(false);
    expect(podeExibirCorrecaoEndereco({ ...pedido, situacao: estagio })).toBe(false);
  });
  it("oculta cancelamento registrado e devolução concluída", () => {
    expect(podeExibirCorrecaoEndereco({ ...pedido, cancelado_em: "2026-11-12" })).toBe(false);
    expect(podeExibirCorrecaoEndereco(pedido, true)).toBe(false);
  });
  it("exige três caracteres de motivo sem contar espaços", () => {
    expect(motivoCorrecaoPreenchido(" ab ")).toBe(false);
    expect(motivoCorrecaoPreenchido(" abc ")).toBe(true);
  });
  it("compara CEP sem máscara", () => {
    expect(cepEntregaDiferente("01310-000", "01310000")).toBe(false);
    expect(cepEntregaDiferente("01310-000", "01310001")).toBe(true);
  });
  it("copia só os sete campos do endereço sem frete ou benefícios", () => {
    expect(camposEnderecoEntrega({ cep: "01310000", numero: 73, frete: { custo: 12 } })).toEqual({ cep: "01310000", logradouro: "", numero: "73", complemento: "", bairro: "", cidade: "", uf: "" });
  });
});