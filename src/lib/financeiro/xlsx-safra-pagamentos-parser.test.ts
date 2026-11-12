import { describe, expect, it } from "vitest";
import { documentoSafraPagamento, ehSafraPagamentos, parseXlsxSafraPagamentos } from "./xlsx-safra-pagamentos-parser";
import { classificarXlsx } from "./xlsx-classificar";

const titulos = ["Data", "Data vencimento", "Data de Inclusão", "N° Documento", "Favorecido / Beneficiário", "CPF / CNPJ", "Valor (R$)", "Modalidade", "Situação", "Negociada", "Incluído por", "Autorizado por", "Autenticação Bancária"];
const linha = (doc: string, nome: string, cpf: string, valor: number, modalidade: string, situacao = "PAGO") => ["10/11/2026", " - ", "09/11/2026", doc, nome, cpf, valor, modalidade, situacao, " - ", "OPERADOR", "AUTORIZADOR", " - "];
export const fixtureSafraPagamentos: unknown[][] = [
  ["Banco Safra"], ["Gestão de Pagamentos - Consulta - Pagamentos"], ["Agência", "Conta"], [500, 5804446],
  ["RELAÇÃO DE PAGAMENTOS", "Visualização por pagamento", "Pagamentos de 01/11/2026 a 30/11/2026"], [], titulos,
  linha("PIX1", "Pessoa", "00.052.998/2247-25", 100, "PIX"),
  linha("BOL1", "Fornecedor", "12.345.678/0001-90", 200, "BOLETO"),
  linha("TRIB1", "Receita", " - ", 300, "TRIBUTO"),
  linha("PEND1", "Pendente", " - ", 400, "PIX", "AGENDADO"),
  linha("DUP1", "Idêntico", " - ", 50, "PIX"), linha("DUP1", "Idêntico", " - ", 50, "PIX"),
  ["TOTAL", "", "", "", "", "", 1100],
];
describe("Safra Por Pagamentos", () => {
  it("exige aba e identificação do Safra, sem confundir Itaú", () => {
    expect(ehSafraPagamentos("Consulta - Pagamentos", fixtureSafraPagamentos)).toBe(true);
    expect(ehSafraPagamentos("Itaú", fixtureSafraPagamentos)).toBe(false);
    expect(ehSafraPagamentos("Consulta - Pagamentos", [["Itaú"]])).toBe(false);
    expect(classificarXlsx(fixtureSafraPagamentos, "Consulta - Pagamentos")).toBe("safra_pagamentos");
    expect(classificarXlsx(fixtureSafraPagamentos, "Outra aba")).not.toBe("safra_pagamentos");
  });
  it("lê as seis linhas e o período do cabeçalho, preservando modalidade e situação", () => {
    const r = parseXlsxSafraPagamentos(fixtureSafraPagamentos);
    expect(r.periodo_inicio).toBe("2026-11-01"); expect(r.periodo_fim).toBe("2026-11-30");
    expect(r.itens).toHaveLength(6);
    expect(r.itens[0]).toEqual({ data_pagamento: "2026-11-10", data_vencimento: null, numero_documento: "PIX1", favorecido_nome: "Pessoa", favorecido_documento: "52998224725", valor: 100, modalidade: "PIX", situacao: "PAGO", ocorrencia: 1 });
    expect(r.itens[1].modalidade).toBe("BOLETO"); expect(r.itens[2].modalidade).toBe("TRIBUTO");
    expect(r.itens[2].favorecido_documento).toBeNull(); expect(r.itens[3].situacao).toBe("AGENDADO");
  });
  it("numera pagamentos idênticos a partir de 1 sem descartá-los", () => {
    expect(parseXlsxSafraPagamentos(fixtureSafraPagamentos).itens.slice(4).map(i => i.ocorrencia)).toEqual([1, 2]);
  });
  it("retira o prefixo apenas quando os últimos onze dígitos são CPF válido", () => {
    expect(documentoSafraPagamento("00.050.983/3088-29")).toBe("50983308829");
    expect(documentoSafraPagamento("00.052.998/2247-24")).toBe("00052998224724");
    expect(documentoSafraPagamento("12.345.678/0001-90")).toBe("12345678000190");
  });
  it("resolve colunas pelos títulos, não pela posição", () => {
    const rows = fixtureSafraPagamentos.map((r, idx) => {
      if (idx < 6) return [...r];
      const out = [...r]; [out[4], out[6]] = [out[6], out[4]]; return out;
    });
    expect(parseXlsxSafraPagamentos(rows).itens[0].valor).toBe(100);
    expect(parseXlsxSafraPagamentos(rows).itens[0].favorecido_nome).toBe("Pessoa");
  });
  it("recusa dados inválidos e cabeçalho incompleto", () => {
    expect(() => parseXlsxSafraPagamentos(fixtureSafraPagamentos.map((r,i) => i === 7 ? [...r.slice(0,6), "100", ...r.slice(7)] : r))).toThrow("Valor inválido");
    expect(() => parseXlsxSafraPagamentos([["Banco Safra"], ["Data"]])).toThrow("Coluna obrigatória");
  });
});
