import { describe, expect, it } from "vitest";
import { linhaBlocoK, resumirNumeracao } from "./numeracaoNf";

describe("numeração das NFs", () => {
  it("só alerta buraco/não autorizada dentro do prazo; cancelada e inutilizada não alertam", () => {
    const r = resumirNumeracao([
      { emitente_cnpj: "63591078000229", serie: "1", numero: 921, ocorrencia: "buraco", data_emissao: null, detalhe: null, prazo_inutilizacao: "2026-11-10", dentro_prazo: true },
      { emitente_cnpj: "63591078000229", serie: "1", numero: 908, ocorrencia: "cancelada", data_emissao: "2026-10-27", detalhe: null, prazo_inutilizacao: null, dentro_prazo: null },
      { emitente_cnpj: "63591078000148", serie: "1", numero: 43, ocorrencia: "buraco", data_emissao: null, detalhe: null, prazo_inutilizacao: "2026-11-10", dentro_prazo: false },
      { emitente_cnpj: "63591078000148", serie: "1", numero: 44, ocorrencia: "inutilizada", data_emissao: null, detalhe: null, prazo_inutilizacao: null, dentro_prazo: null },
    ]);
    expect(r).toEqual({ canceladas: 1, inutilizadas: 1, naoAutorizadas: 0, buracos: 2, pendentesNoPrazo: 1, prazo: "2026-11-10" });
  });
  it("Bloco K marca produto sem NCM/unidade e mantém a ordem das 8 colunas", () => {
    expect(linhaBlocoK({ codigo_produto: "02240", produto: "Vela", quantidade: 3, valor_unitario: 1.5, unidade: null, ncm: null, posse_rotulo: "a confirmar", participante_cnpj: null }))
      .toEqual(["02240", "Vela", 3, 1.5, "SEM UNIDADE", "SEM NCM", "a confirmar", ""]);
  });
});
