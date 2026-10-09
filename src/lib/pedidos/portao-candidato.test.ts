import { describe, expect, it } from "vitest";
import { agruparCandidatos, pedidosComCandidato, type PortaoCandidato } from "./portao-candidato";

describe("candidatos na fila", () => {
  it("consulta a view primeiro e a fila só com os ids que ela devolveu", async () => {
    const fila = [{ id: "recente", estagio: "aguardando_pagamento" }, { id: "PED-2116", estagio: "entregue" }];
    const ordem: string[] = [];
    const resultado = await pedidosComCandidato(
      async () => {
        ordem.push("view");
        return [{ pedido_id: "PED-2116" }, { pedido_id: "PED-2116" }];
      },
      async (ids) => {
        ordem.push(`fila:${ids.join(",")}`);
        return fila.filter((p) => ids.includes(p.id));
      },
    );
    expect(resultado).toEqual([{ id: "PED-2116", estagio: "entregue" }]);
    // A view foi a primeira consulta; a fila recebeu apenas os ids dela, sem repetição.
    expect(ordem).toEqual(["view", "fila:PED-2116"]);
  });
  it("pagina pelo lado dos ids da view quando passam do lote", async () => {
    const ids = ["a", "b", "c"];
    const fila = ids.map((id) => ({ id, estagio: "entregue" }));
    const lotes: string[][] = [];
    const resultado = await pedidosComCandidato(
      async () => ids.map((id) => ({ pedido_id: id })),
      async (lote) => {
        lotes.push(lote);
        return fila.filter((p) => lote.includes(p.id));
      },
      2,
    );
    expect(lotes).toEqual([["a", "b"], ["c"]]);
    expect(resultado).toEqual(fila);
  });
  it("não consulta a fila quando a view não tem candidato", async () => {
    let consultouFila = false;
    const resultado = await pedidosComCandidato(
      async () => [],
      async () => {
        consultouFila = true;
        return [];
      },
    );
    expect(resultado).toEqual([]);
    expect(consultouFila).toBe(false);
  });
  it("preserva vários candidatos de um pedido e o sinal sem instrumento", () => {
    const c: PortaoCandidato = { pedido_id: "PED-2116", meio: "pix", valor_origem: 523.73, valor_esperado: 523.73, origem_data: "2026-08-04", origem_conta: "Safra", origem_descricao: "PIX", dias_de_diferenca: 0, identidade: "documento", situacao: "sem_instrumento", motivo: "Sem instrumento" };
    const mapa = agruparCandidatos([c, { ...c, meio: "cartao" }]);
    expect(mapa.get("PED-2116")).toHaveLength(2);
    expect(mapa.get("PED-2116")?.[0]).toMatchObject({ valor_origem: 523.73, identidade: "documento", situacao: "sem_instrumento" });
  });
});
