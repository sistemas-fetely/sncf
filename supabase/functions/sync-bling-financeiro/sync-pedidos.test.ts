import { describe, expect, it } from "bun:test";
import { filtroAlteracaoPedidos } from "./filtro-pedidos.ts";
import { syncPedidos } from "./sync-pedidos.ts";

describe("sync pedidos fiscais", () => {
  it("usa data de alteração com datetime e sobreposição de um dia", () => {
    const filtro = filtroAlteracaoPedidos("2026-11-12T09:20:00.000Z");
    expect(decodeURIComponent(filtro)).toBe("&dataAlteracaoInicial=2026-11-11 09:20:00");
  });
  it("cursor nulo faz varredura sem filtro", async () => {
    const urls: string[] = [];
    const client = { get: async (url: string) => { urls.push(url); return { data: [] }; } };
    const r = await syncPedidos({}, client as never, () => false, { ultima_pagina: 8, ultima_data_corte: null });
    expect(urls).toEqual(["/pedidos/vendas?limite=100&pagina=9"]);
    expect(r.proximaPagina).toBe(0);
  });
  it("filtro rejeitado aparece em ultimoErro e nunca repete sem filtro", async () => {
    const urls: string[] = [];
    const client = { get: async (url: string) => { urls.push(url); throw new Error("400: dataAlteracaoInicial inválida"); } };
    const r = await syncPedidos({}, client as never, () => false, { ultima_pagina: 0, ultima_data_corte: "2026-11-12T09:20:00Z" });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("dataAlteracaoInicial=");
    expect(r.ultimoErro).toBe("pagina 1: 400: dataAlteracaoInicial inválida");
    expect(r.proximaPagina).toBe(1);
  });
  it("cursor inválido não dispara varredura sem filtro", async () => {
    let chamadas = 0;
    const client = { get: async () => { chamadas++; return { data: [] }; } };
    const r = await syncPedidos({}, client as never, () => false, { ultima_pagina: 0, ultima_data_corte: "inválida" });
    expect(chamadas).toBe(0);
    expect(r.ultimoErro).toContain("Cursor de pedidos com data inválida");
  });
  it("parceiro novo usa bling e o pedido mantém api_bling e sua data original", async () => {
    const inseridos: { tabela: string; registro: Record<string, unknown> }[] = [];
    let paginaGravada = false;
    const sb = { from: (tabela: string) => {
      const q = {
        select: () => q, in: () => q, order: () => q, eq: () => q,
        limit: async () => ({ data: [], error: null }),
        maybeSingle: async () => ({ data: tabela === "parceiros_comerciais" ? { id: "novo-parceiro" } : null, error: null }),
        insert: (registro: Record<string, unknown>) => { inseridos.push({ tabela, registro }); return q; },
        update: () => { if (tabela === "integracoes_sync_cursor") paginaGravada = true; return q; },
      };
      return q;
    } };
    const client = { get: async () => ({ data: [{ id: 10, data: "2026-11-01", contato: { id: 20, nome: "Cliente novo" } }] }) };
    const r = await syncPedidos(sb, client as never, () => paginaGravada, { ultima_pagina: 0, ultima_data_corte: null });
    expect(r.criados).toBe(1);
    expect(inseridos.find((i) => i.tabela === "parceiros_comerciais")?.registro.origem).toBe("bling");
    expect(inseridos.find((i) => i.tabela === "pedidos_venda")?.registro).toMatchObject({ origem: "api_bling", data_pedido: "2026-11-01", parceiro_id: "novo-parceiro" });
  });
});