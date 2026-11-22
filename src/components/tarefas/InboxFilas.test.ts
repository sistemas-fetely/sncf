import { expect, it, vi } from "vitest";
import type { FilaInbox } from "@/hooks/tarefas/useInboxFilas";
import { agruparFilasDash, type AreaFilaDash } from "./InboxFilas";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const fila = (chave: string, total: number, severidade = "normal") => ({
  chave, nome: chave, total, severidade, erro: null, rota: "/tarefas/fila", area_nome: "Não usar este nome",
} as FilaInbox);
const area = (chave: string, id: string, nome: string, ordem: number): AreaFilaDash => ({
  chave, departamento_id: id, departamentos: { nome, ordem },
});

it("agrupa por departamento_id, usa nome e ordem do departamento e deixa Sem área no fim", () => {
  const grupos = agruparFilasDash([fila("a", 1000), fila("b", 34), fila("c", 5), fila("solta", 7)], [
    area("a", "log", "Logística", 2), area("b", "log", "Logística", 2), area("c", "fin", "Finanças", 1),
  ], false);
  expect(grupos.map((g) => [g.id, g.nome])).toEqual([["fin", "Finanças"], ["log", "Logística"], ["sem-area", "Sem área"]]);
  expect(grupos[1].filas.map((f) => f.chave)).toEqual(["a", "b"]);
});

it("soma itens e conta apenas filas com itens, sem modificar nenhuma contagem", () => {
  const filas = [fila("a", 1000), fila("b", 34), fila("zero", 0)];
  const areas = filas.map((f) => area(f.chave, "log", "Logística", 1));
  const [grupo] = agruparFilasDash(filas, areas, false);
  expect(grupo.total).toBe(1034);
  expect(grupo.filasComItens).toBe(2);
  expect(filas.map((f) => f.total)).toEqual([1000, 34, 0]);
});

it("ordena critica > alta > normal > baixa e desempata por quantidade desc", () => {
  const filas = [fila("baixa", 900, "baixa"), fila("normal", 800), fila("alta-menor", 10, "alta"),
    fila("critica", 1, "critica"), fila("alta-maior", 30, "alta")];
  const [grupo] = agruparFilasDash(filas, [], false);
  expect(grupo.filas.map((f) => f.chave)).toEqual(["critica", "alta-maior", "alta-menor", "normal", "baixa"]);
  expect(filas.map((f) => f.chave)).toEqual(["baixa", "normal", "alta-menor", "critica", "alta-maior"]);
});

it("mantém filas vazias no final independentemente da severidade", () => {
  const [grupo] = agruparFilasDash([fila("zero-critica", 0, "critica"), fila("baixa", 1, "baixa"), fila("zero-normal", 0)], [], false);
  expect(grupo.filas.map((f) => f.chave)).toEqual(["baixa", "zero-critica", "zero-normal"]);
});

it("ocultar vazias não altera os totais nem o número de filas com itens da seção", () => {
  const filas = [fila("a", 12), fila("zero", 0)];
  const [grupo] = agruparFilasDash(filas, [], true);
  expect(grupo.filas.map((f) => f.chave)).toEqual(["a"]);
  expect(grupo.total).toBe(12);
  expect(grupo.filasComItens).toBe(1);
});

it("ocultar vazias preserva erros de contagem e seções sem itens", () => {
  const [grupo] = agruparFilasDash([fila("zero", 0), { ...fila("erro", 0), erro: "Falha de contagem" }], [], true);
  expect(grupo.filas.map((f) => f.chave)).toEqual(["erro"]);
  expect(grupo.total).toBe(0);
  expect(grupo.filasComItens).toBe(0);
  expect(agruparFilasDash([fila("zero", 0)], [], true)[0].filas).toEqual([]);
});