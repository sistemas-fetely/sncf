import { describe, expect, it } from "vitest";
import { filtrarItensDevolucao, rotuloFinanceiroDevolucao } from "./gavetaDevolucao";

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
describe("status financeiro", () => {
  it("sem ressarcimento prevalece sobre etapa ressarcida", () => expect(rotuloFinanceiroDevolucao("sem_ressarcimento", true)).toBe("Sem ressarcimento (nada pago)"));
  it("sem ressarcimento prevalece também sem etapa concluída", () => expect(rotuloFinanceiroDevolucao("sem_ressarcimento", false)).toBe("Sem ressarcimento (nada pago)"));
  it("preserva os demais estados", () => {
    expect(rotuloFinanceiroDevolucao("haver", true)).toBe("ressarcida");
    expect(rotuloFinanceiroDevolucao(null, false)).toBe("pendente");
  });
});