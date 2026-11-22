import { expect, it, vi } from "vitest";
import type { FilaInbox } from "@/hooks/tarefas/useInboxFilas";
import { agruparFilasDash, filtrarFilasDash, type AreaFilaDash } from "./InboxFilas";

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
  ]);
  expect(grupos.map((g) => [g.id, g.nome])).toEqual([["fin", "Finanças"], ["log", "Logística"], ["sem-area", "Sem área"]]);
  expect(grupos[1].filas.map((f) => f.chave)).toEqual(["a", "b"]);
});

it("soma itens e conta apenas filas com itens, sem modificar nenhuma contagem", () => {
  const filas = [fila("a", 1000), fila("b", 34), fila("zero", 0)];
  const areas = filas.map((f) => area(f.chave, "log", "Logística", 1));
  const [grupo] = agruparFilasDash(filas, areas);
  expect(grupo.total).toBe(1034);
  expect(grupo.filasComItens).toBe(2);
  expect(filas.map((f) => f.total)).toEqual([1000, 34, 0]);
});

it("usa a pior severidade presente na área, incluindo filas vazias", () => {
  const [grupo] = agruparFilasDash([fila("baixa", 900, "baixa"), fila("normal", 800), fila("alta", 30, "alta"), fila("critica", 0, "critica")], []);
  expect(grupo.severidade).toBe("critica");
  expect(agruparFilasDash([fila("baixa", 1, "baixa")], [])[0].severidade).toBe("baixa");
  expect(agruparFilasDash([fila("normal", 1), fila("alta", 1, "alta")], [])[0].severidade).toBe("alta");
});

it("grid preserva a ordem original e coloca zeradas no final", () => {
  const filas = [fila("zero-critica", 0, "critica"), fila("baixa", 1, "baixa"), fila("alta", 30, "alta"), fila("zero-normal", 0)];
  expect(filtrarFilasDash(filas, [], null, false).map((f) => f.chave)).toEqual(["baixa", "alta", "zero-critica", "zero-normal"]);
  expect(filas.map((f) => f.chave)).toEqual(["zero-critica", "baixa", "alta", "zero-normal"]);
});

it("filtra uma única área sem alterar totais dos chips e Todas restaura o grid", () => {
  const filas = [fila("a", 12), fila("b", 8), fila("zero", 0), fila("solta", 2)];
  const areas = [area("a", "log", "Logística", 1), area("zero", "log", "Logística", 1), area("b", "fin", "Financeiro", 2)];
  expect(filtrarFilasDash(filas, areas, "log", false).map((f) => f.chave)).toEqual(["a", "zero"]);
  expect(filtrarFilasDash(filas, areas, "log", true).map((f) => f.chave)).toEqual(["a"]);
  expect(filtrarFilasDash(filas, areas, "sem-area", false).map((f) => f.chave)).toEqual(["solta"]);
  expect(filtrarFilasDash(filas, areas, null, false).map((f) => f.chave)).toEqual(["a", "b", "solta", "zero"]);
  const grupos = agruparFilasDash(filas, areas);
  expect(grupos.map((g) => [g.total, g.filasComItens])).toEqual([[12, 1], [8, 1], [2, 1]]);
});

it("ocultar vazias preserva alertas de falha de contagem", () => {
  const filas = [fila("zero", 0), { ...fila("erro", 0), erro: "Falha de contagem" }];
  expect(filtrarFilasDash(filas, [], null, true).map((f) => f.chave)).toEqual(["erro"]);
  expect(agruparFilasDash(filas, [])[0].filasComItens).toBe(0);
});
