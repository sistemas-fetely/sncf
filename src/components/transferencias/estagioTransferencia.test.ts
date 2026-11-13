import { expect, it } from "vitest";
import { estadoEnvioTransferencia } from "./estagioTransferencia";

it("erro de envio tem prioridade mesmo quando o pedido possui id no Bling", () => {
  expect(estadoEnvioTransferencia({ estagio: "pre_faturamento", blingIdDestino: "27395674379", blingEnvioErro: "Falha ao enviar" })).toBe("erro");
});

it("pedido enviado continua em pré-faturamento aguardando NF", () => {
  expect(estadoEnvioTransferencia({ estagio: "pre_faturamento", blingIdDestino: "27395674379", blingEnvioErro: " " })).toBe("aguardando_nf");
});

it("sem informação de envio mantém o estágio atual", () => {
  expect(estadoEnvioTransferencia({ estagio: "pre_faturamento", blingIdDestino: " ", blingEnvioErro: null })).toBe("estagio");
});

it("informação de envio não substitui selos de outros estágios", () => {
  for (const estagio of [null, "em_transporte", "entregue", "rascunho"]) {
    expect(estadoEnvioTransferencia({ estagio, blingIdDestino: "27395674379", blingEnvioErro: "Falha anterior" })).toBe("estagio");
  }
});