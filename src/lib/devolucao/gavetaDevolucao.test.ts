import { describe, expect, it } from "vitest";
import { filtrarItensDevolucao, mapearItensDevolucao, rotuloFinanceiroDevolucao } from "./gavetaDevolucao";

const itens = [
  { sku: "VEL-01", nome_comercial: "Vela dourada", qtd_saiu: 10, qtd_ja_retornada: 4, qtd_pendente: 6 },
  { sku: "PRT-02", nome_comercial: "Prato azul", qtd_saiu: 3, qtd_ja_retornada: 3, qtd_pendente: 0 },
  { sku: "VEL-03", nome_comercial: null, qtd_saiu: 1, qtd_ja_retornada: 2, qtd_pendente: -1 },
];
describe("itens da gaveta de devolução", () => {
  it("sem filtro mantém todos os itens e a ordem", () => expect(filtrarItensDevolucao(itens, "", false)).toEqual(itens));
  it("busca SKU sem distinguir caixa e espaços externos", () => expect(filtrarItensDevolucao(itens, " vel-01 ", false)).toEqual([itens[0]]));
  it("busca pelo nome", () => expect(filtrarItensDevolucao(itens, "PRATO", false)).toEqual([itens[1]]));
  it("só pendentes exige quantidade maior que zero", () => expect(filtrarItensDevolucao(itens, "", true)).toEqual([itens[0]]));
  it("combina busca e pendência", () => expect(filtrarItensDevolucao(itens, "prato", true)).toEqual([]));
});
describe("itens da view completa (vw_devolucao_itens)", () => {
  const linhasView = [
    { sku: "PRTSALBW.PL.18/01521", nome_comercial: "Prato Saladeira", qtd_saiu: 10, qtd_ja_retornada: 10, qtd_pendente: 0 },
    { sku: "VEL-09", nome_comercial: null, qtd_saiu: null, qtd_ja_retornada: null, qtd_pendente: null },
  ];
  it("item totalmente retornado (pendente 0) aparece na tabela", () => {
    const itens = mapearItensDevolucao(linhasView);
    expect(filtrarItensDevolucao(itens, "", false).map((i) => i.sku)).toContain("PRTSALBW.PL.18/01521");
    expect(itens[0]).toEqual({ sku: "PRTSALBW.PL.18/01521", nome_comercial: "Prato Saladeira", qtd_saiu: 10, qtd_ja_retornada: 10, qtd_pendente: 0 });
  });
  it("item totalmente retornado some com 'Só pendentes'", () => {
    const itens = mapearItensDevolucao(linhasView);
    expect(filtrarItensDevolucao(itens, "", true).map((i) => i.sku)).not.toContain("PRTSALBW.PL.18/01521");
  });
  it("quantidades nulas da view viram zero", () => {
    expect(mapearItensDevolucao(linhasView)[1]).toEqual({ sku: "VEL-09", nome_comercial: null, qtd_saiu: 0, qtd_ja_retornada: 0, qtd_pendente: 0 });
  });
});
describe("status financeiro", () => {
  it("sem ressarcimento prevalece sobre etapa ressarcida", () => expect(rotuloFinanceiroDevolucao("sem_ressarcimento", true)).toBe("Sem ressarcimento (nada pago)"));
  it("sem ressarcimento prevalece também sem etapa concluída", () => expect(rotuloFinanceiroDevolucao("sem_ressarcimento", false)).toBe("Sem ressarcimento (nada pago)"));
  it("preserva os demais estados", () => {
    expect(rotuloFinanceiroDevolucao("haver", true)).toBe("ressarcida");
    expect(rotuloFinanceiroDevolucao(null, false)).toBe("pendente");
  });
});