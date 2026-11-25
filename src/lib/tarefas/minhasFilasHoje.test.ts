import { expect, it } from "vitest";
import { ordenarMinhasFilasHoje, resumirMinhasFilasHoje, type MinhaFilaHoje } from "./minhasFilasHoje";

const fila = (chave: string, total: number, vencidos = 0, severidade = "normal", divida = 0): MinhaFilaHoje => ({
  fila_chave: chave, fila_nome: chave, itens_total: total, itens_vencidos: vencidos,
  itens_divida: divida, itens_no_prazo: total - vencidos - divida, severidade,
  area_nome: "Operação", rota: "/tarefas/fila", tem_relogio: true,
  prazo_dias: 2, vencimento_mais_antigo: null,
});

it("prioriza vencidos em ordem decrescente antes da severidade", () => {
  expect(ordenarMinhasFilasHoje([fila("critica", 100, 0, "critica"), fila("dois", 10, 2), fila("cinco", 10, 5, "baixa")]).map(f => f.fila_chave))
    .toEqual(["cinco", "dois", "critica"]);
});

it("desempata por crítica, alta, normal e baixa", () => {
  expect(ordenarMinhasFilasHoje([fila("baixa", 10, 1, "baixa"), fila("normal", 10, 1), fila("alta", 10, 1, "alta"), fila("critica", 10, 1, "critica")]).map(f => f.fila_chave))
    .toEqual(["critica", "alta", "normal", "baixa"]);
});

it("desempata severidade e vencidos pelo total decrescente sem alterar a entrada", () => {
  const filas = [fila("menor", 3), fila("maior", 20)];
  expect(ordenarMinhasFilasHoje(filas).map(f => f.fila_chave)).toEqual(["maior", "menor"]);
  expect(filas.map(f => f.fila_chave)).toEqual(["menor", "maior"]);
});

it("oculta filas vazias por padrão e as coloca no fim quando exibidas", () => {
  const filas = [fila("vazia", 0, 0, "critica"), fila("ativa", 1, 0, "baixa")];
  expect(ordenarMinhasFilasHoje(filas).map(f => f.fila_chave)).toEqual(["ativa"]);
  expect(ordenarMinhasFilasHoje(filas, true).map(f => f.fila_chave)).toEqual(["ativa", "vazia"]);
});

it("mantém filas sem relógio pelo total de itens", () => {
  const semRelogio = { ...fila("sem-relogio", 8), tem_relogio: false };
  expect(ordenarMinhasFilasHoje([fila("menor", 2), semRelogio])).toEqual([semRelogio, fila("menor", 2)]);
});

it("resume todas as filas, vencidos e dívida sem depender do filtro", () => {
  expect(resumirMinhasFilasHoje([fila("a", 10, 3, "alta", 2), fila("b", 9, 4, "normal", 1), fila("vazia", 0)]))
    .toEqual({ filas: 3, vencidos: 7, divida: 3 });
});