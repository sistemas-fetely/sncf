import { describe, expect, it } from "vitest";
import { agruparCandidatos, pedidosComCandidato, type PortaoCandidato } from "./portao-candidato";

describe("candidatos na fila", () => {
  it("encontra PED-2116 entregue mesmo após os pedidos recentes, sem consultar ids fora do bloco", async () => {
    const pedidos = [{ id: "recente", estagio: "aguardando_pagamento" }, { id: "PED-2116", estagio: "entregue" }];
    const consultas: string[][] = [];
    const resultado = await pedidosComCandidato(async (inicio, fim) => pedidos.slice(inicio, fim + 1), async (ids) => {
      consultas.push(ids);
      return ids.includes("PED-2116") ? [{ pedido_id: "PED-2116" }] : [];
    }, 1);
    expect(resultado).toEqual([{ id: "PED-2116", estagio: "entregue" }]);
    expect(consultas).toEqual([["recente"], ["PED-2116"]]);
  });
  it("preserva vários candidatos de um pedido e o sinal sem instrumento", () => {
    const c: PortaoCandidato = { pedido_id: "PED-2116", meio: "pix", valor_origem: 523.73, valor_esperado: 523.73, origem_data: "2026-08-04", origem_conta: "Safra", origem_descricao: "PIX", dias_de_diferenca: 0, identidade: "documento", situacao: "sem_instrumento", motivo: "Sem instrumento" };
    const mapa = agruparCandidatos([c, { ...c, meio: "cartao" }]);
    expect(mapa.get("PED-2116")).toHaveLength(2);
    expect(mapa.get("PED-2116")?.[0]).toMatchObject({ valor_origem: 523.73, identidade: "documento", situacao: "sem_instrumento" });
  });
  it("não consulta candidatos quando a página não tem pedidos", async () => {
    let consultou = false;
    expect(await pedidosComCandidato(async () => [], async () => { consultou = true; return []; })).toEqual([]);
    expect(consultou).toBe(false);
  });
});