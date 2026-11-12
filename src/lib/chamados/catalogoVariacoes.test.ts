import { describe, expect, it } from "vitest";
import { buscarServico, codigoAssuntoSelecionado, codigoVariacaoValido } from "./catalogoVariacoes";

const filial = { codigo: "nf_filial", nome: "Filial", descricao: "Destinatário incorreto", libera_refaturamento: true };
const valor = { codigo: "nf_valor", nome: "Valor", descricao: "Preço incorreto", libera_refaturamento: false };
const servico = { codigo: "corrigir_nf", item: "Correção de nota", descricao: "Documento fiscal", fila: "Faturamento", variacoes: [filial, valor] };

describe("variações do catálogo de chamados", () => {
  it("busca nome e descrição das variações sem acento ou caixa e fornece pré-seleção", () => {
    expect(buscarServico(servico, "DESTINATARIO")).toEqual({ encontrado: true, variacao: filial });
    expect(buscarServico(servico, "PRECO").variacao).toEqual(valor);
  });
  it("busca serviço, descrição e grupo atravessando as filas", () => {
    for (const termo of ["CORRECAO", "fiscal", "FATURAMENTO"]) expect(buscarServico(servico, termo).encontrado).toBe(true);
    expect(buscarServico(servico, "rastreio").encontrado).toBe(false);
  });
  it("serviço com variações exige uma seleção pertencente ao serviço", () => {
    expect(codigoAssuntoSelecionado(servico, null)).toBeNull();
    expect(codigoAssuntoSelecionado(servico, { ...filial, codigo: "outro" })).toBeNull();
  });
  it("envia o código da variação e não o do serviço", () => {
    expect(codigoAssuntoSelecionado(servico, filial)).toBe("nf_filial");
    expect(codigoAssuntoSelecionado(servico, valor)).toBe("nf_valor");
  });
  it("preserva o código do serviço sem variações", () => {
    expect(codigoAssuntoSelecionado({ ...servico, variacoes: [] }, null)).toBe("corrigir_nf");
  });
  it("código obrigatório deve ser um slug", () => {
    expect(codigoVariacaoValido("nf_filial")).toBe(true);
    expect(codigoVariacaoValido("nf-valor")).toBe(true);
    expect(codigoVariacaoValido("")).toBe(false);
    expect(codigoVariacaoValido("NF filial")).toBe(false);
  });
});