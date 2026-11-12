import { describe, expect, it } from "vitest";
import { carregarReembolsosLoja, destinoDevolucaoLoja, filtrarReembolsosLoja, ordenarReembolsosLoja, resumirReembolsosLoja, type ReembolsoLoja } from "./reembolsosLoja";

const linha = (patch: Partial<ReembolsoLoja> = {}): ReembolsoLoja => ({ id: "1", pedido_loja: null, pedido_id: null, pedido_ref: null, cliente: null, data_reembolso: null, valor: null, meio: null, estorno: "sem_valor", motivo: null, voltou_estoque: false, itens: null, valor_pedido: null, pedido_enviado: false, devolucao_id: null, devolucao_numero: null, devolucao_status: null, nf_dev_numero: null, situacao: "cancelamento", ...patch });

describe("reembolsos da loja", () => {
  it("lê páginas de 1000 até esgotar", async () => {
    const ranges: number[][] = [];
    const rows = await carregarReembolsosLoja(async (de, ate) => { ranges.push([de, ate]); return Array.from({ length: de === 0 ? 1000 : 23 }, () => linha()); });
    expect(rows).toHaveLength(1023);
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
  });
  it("não entrega leitura parcial quando uma página falha", async () => {
    await expect(carregarReembolsosLoja(async (de) => { if (de) throw new Error("Leitura recusada"); return Array.from({ length: 1000 }, () => linha()); })).rejects.toThrow("Leitura recusada");
  });
  it("combina busca por pedido, cliente ou motivo com os três filtros", () => {
    const rows = [linha({ id: "ok", pedido_loja: "#1510", cliente: "ANA", motivo: "Valor errado", estorno: "pago", situacao: "com_devolucao", data_reembolso: "2026-11-12" }), linha({ id: "fora", cliente: "ANA", estorno: "pendente" })];
    for (const busca of ["1510", "ana", "valor errado"]) expect(filtrarReembolsosLoja(rows, { busca, estorno: "pago", situacao: "com_devolucao", mes: "2026-11" }).map((r) => r.id)).toEqual(["ok"]);
  });
  it.each(["asc", "desc"] as const)("mantém datas vazias no fim em %s", (dir) => {
    expect(ordenarReembolsosLoja([linha({ id: "vazia" }), linha({ id: "antiga", data_reembolso: "2026-10-01" }), linha({ id: "nova", data_reembolso: "2026-11-12" })], "data_reembolso", dir).map((r) => r.id)).toEqual(dir === "desc" ? ["nova", "antiga", "vazia"] : ["antiga", "nova", "vazia"]);
  });
  it("separa valores pagos e pendentes e conta só os sem devolução", () => {
    expect(resumirReembolsosLoja([linha({ valor: 100, estorno: "pago", situacao: "com_devolucao" }), linha({ valor: 50, estorno: "pendente", situacao: "sem_devolucao" }), linha({ valor: 0, estorno: "sem_valor" })])).toEqual({ total: 150, pagos: 1, valorPago: 100, pendentes: 1, valorPendente: 50, semDevolucao: 1 });
  });
  it("abre o funil buscando a devolução", () => {
    expect(destinoDevolucaoLoja("DEV-2318")).toBe("/devolucoes?aba=funil&q=DEV-2318");
  });
});