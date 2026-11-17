import { expect, it } from "vitest";
import { aReceberNoDestino, correspondeNumero, correspondeEstagio, destinoDetalheTransferencia, ordenarAndamento, qualGavetaAbre, type TransferenciaAndamento } from "./painelRegras";

it("busca número sem distinguir maiúsculas e com espaços externos", () => {
  expect(correspondeNumero("TRS-0018", " trs-0018 ")).toBe(true);
  expect(correspondeNumero("TRS-0014", "0018")).toBe(false);
});
it("histórico separa entregue, cancelado e andamento", () => {
  expect(correspondeEstagio("entregue", "entregue")).toBe(true);
  expect(correspondeEstagio("cancelado", "cancelado")).toBe(true);
  expect(correspondeEstagio("entregue", "andamento")).toBe(false);
  expect(correspondeEstagio("cancelado", "andamento")).toBe(false);
  expect(correspondeEstagio("em_separacao", "andamento")).toBe(true);
});
it("andamento ordena fase crescente e dias decrescentes", () => {
  const linhas = [{ id: "b", fase_ordem: 20, dias_na_fase: 1 }, { id: "c", fase_ordem: 20, dias_na_fase: 5 }, { id: "a", fase_ordem: 10, dias_na_fase: 0 }] as TransferenciaAndamento[];
  expect(ordenarAndamento(linhas).map((t) => t.id)).toEqual(["a", "c", "b"]);
});
it("clique na linha: TI abre gaveta TI, pedido abre GavetaTransferencia mesmo com canal interno", () => {
  expect(qualGavetaAbre("ti")).toBe("ti");
  expect(qualGavetaAbre("pedido")).toBe("pedido");
  expect(qualGavetaAbre(null)).toBe("pedido");
});
it("link da gaveta: Expedição SP só na Mesa SP, demais casos abrem o pedido", () => {
  expect(destinoDetalheTransferencia({ canal: "interno", origem_codigo: "SITE-SP", estagio: "pre_separacao" })).toBe("mesa");
  expect(destinoDetalheTransferencia({ canal: "interno", origem_codigo: "SITE-SP", estagio: "em_separacao" })).toBe("mesa");
  expect(destinoDetalheTransferencia({ canal: "interno", origem_codigo: "SITE-SP", estagio: "entregue" })).toBe("pedido");
  expect(destinoDetalheTransferencia({ canal: "interno", origem_codigo: "XPM-SC", estagio: "em_separacao" })).toBe("pedido");
  expect(destinoDetalheTransferencia({ canal: "b2b", origem_codigo: "SITE-SP", estagio: "em_separacao" })).toBe("pedido");
});
it("regularização não conta a receber, física mantém regra anterior", () => {
  const t = { id: "1", origem_registro: "pedido", tipo_transferencia: "regularizacao", sem_destino: false, estagio: "entregue" };
  expect(aReceberNoDestino(t, new Map())).toBe(false);
  expect(aReceberNoDestino({ ...t, tipo_transferencia: "fisica" }, new Map())).toBe(true);
  expect(aReceberNoDestino({ ...t, tipo_transferencia: "fisica" }, new Map([["1", {}]]))).toBe(false);
});