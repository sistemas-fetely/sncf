import { expect, it } from "vitest";
import { aReceberNoDestino, correspondeNumero, correspondeEstagio, ordenarAndamento, type TransferenciaAndamento } from "./painelRegras";

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
it("regularização não conta a receber, física mantém regra anterior", () => {
  const t = { id: "1", origem_registro: "pedido", tipo_transferencia: "regularizacao", sem_destino: false, estagio: "entregue" };
  expect(aReceberNoDestino(t, new Map())).toBe(false);
  expect(aReceberNoDestino({ ...t, tipo_transferencia: "fisica" }, new Map())).toBe(true);
  expect(aReceberNoDestino({ ...t, tipo_transferencia: "fisica" }, new Map([["1", {}]]))).toBe(false);
});