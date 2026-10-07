import { describe, expect, it } from "vitest";
import { nomeArquivoExtrato, nomeZipExtratos, pontosDeCorte } from "./pdfSeparados";

describe("PDFs separados do lote", () => {
  it("nome do PDF sem acento, espaços viram _ e sem especiais", () => {
    expect(nomeArquivoExtrato("2026-10", "Lúcia Conceição")).toBe("Extrato_2026-10_Lucia_Conceicao.pdf");
    expect(nomeArquivoExtrato("2026-10", "  Anne  & Cia. (SP) ")).toBe("Extrato_2026-10_Anne_Cia_SP.pdf");
  });
  it("nome do zip pela competência", () => {
    expect(nomeZipExtratos("2026-10")).toBe("Extratos_2026-10.zip");
  });
  it("não corta linha ao meio", () => {
    expect(pontosDeCorte(250, 100, [{ top: 90, bottom: 110 }])).toEqual([90, 190]);
  });
  it("cabeçalho do mês não fica sozinho no fim da página", () => {
    expect(pontosDeCorte(150, 100, [{ top: 80, bottom: 95, grudaProximo: true }, { top: 95, bottom: 115 }])[0]).toBe(80);
  });
});
