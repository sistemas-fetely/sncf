import { describe, expect, it } from "vitest";
import { carregarPedidosFiscais, destinoNfsVenda, escolherFilaDivergencia, filtrarPedidosFiscais, ordenarPedidosFiscais, resumirDivergencias, type PedidoFiscal } from "./pedidosFiscais";

const pedido = (patch: Partial<PedidoFiscal>): PedidoFiscal => ({ id: "1", numero: null, numero_loja: null, data_pedido: null, cliente_nome: null, cliente_cnpj_cpf: null, valor_total: null, valor_frete: null, situacao_label: null, situacao_cor: null, nf_id: null, nf_numero: null, nf_serie: null, nf_situacao: null, nf_valor: null, nf_data_emissao: null, pedido_sncf_id: null, pedido_sncf_ref: null, nf_qtd: null, numero_loja_repetido: null, divergencia: null, dias_pedido: null, ...patch });
describe("pedidos fiscais", () => {
  it("seleciona a primeira fila com itens e preserva a escolha explícita, mesmo vazia", () => {
    const rows = [pedido({ divergencia: "cancelado_com_nf" }), pedido({ divergencia: "aberto_com_nf" })];
    expect(escolherFilaDivergencia(rows, "")).toBe("aberto_com_nf");
    expect(escolherFilaDivergencia([...rows, pedido({ divergencia: "sem_nf" })], "")).toBe("sem_nf");
    expect(escolherFilaDivergencia(rows, "sem_nf")).toBe("sem_nf");
  });
  it("conta e soma somente os itens da classificação fornecida pela view", () => {
    const rows = [pedido({ divergencia: "sem_nf", valor_total: 10 }), pedido({ divergencia: "sem_nf", valor_total: 20 }), pedido({ divergencia: "aberto_com_nf", valor_total: 50 }), pedido({ valor_total: 999 })];
    expect(resumirDivergencias(rows).map((r) => [r.codigo, r.quantidade, r.valor])).toEqual([["sem_nf", 2, 30], ["aberto_com_nf", 1, 50], ["cancelado_com_nf", 0, 0]]);
  });
  it("ordena dias decrescentes e mantém zero antes dos vazios", () => {
    const rows = [pedido({ id: "vazio" }), pedido({ id: "novo", dias_pedido: 0 }), pedido({ id: "antigo", dias_pedido: 30 })];
    expect(ordenarPedidosFiscais(rows, "dias_pedido", "desc").map((p) => p.id)).toEqual(["antigo", "novo", "vazio"]);
  });
  it("carrega páginas de 1000 sem o corte de 500", async () => {
    const ranges: number[][] = [];
    const rows = await carregarPedidosFiscais(async (de, ate) => {
      ranges.push([de, ate]);
      return Array.from({ length: de === 0 ? 1000 : 201 }, (_, i) => pedido({ id: String(de + i) }));
    });
    expect(rows).toHaveLength(1201);
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
  });
  it("não retorna uma lista parcial quando uma leitura falha", async () => {
    await expect(carregarPedidosFiscais(async (de) => {
      if (de) throw new Error("Falha real");
      return Array.from({ length: 1000 }, () => pedido({}));
    })).rejects.toThrow("Falha real");
  });
  it.each(["asc", "desc"] as const)("vazios vão para o fim em %s", (dir) => {
    const sorted = ordenarPedidosFiscais([pedido({ id: "vazio" }), pedido({ id: "10", numero: 10 }), pedido({ id: "2", numero: 2 })], "numero", dir);
    expect(sorted.map((p) => p.id)).toEqual(dir === "asc" ? ["2", "10", "vazio"] : ["10", "2", "vazio"]);
  });
  it("busca pedido da loja e combina mês, situação e presença de NF", () => {
    const rows = [pedido({ id: "ok", numero_loja: "LOJA-12", data_pedido: "2026-11-11", situacao_label: "Atendido", nf_qtd: 2 }), pedido({ id: "sem", numero_loja: "LOJA-12" })];
    expect(filtrarPedidosFiscais(rows, { busca: "loja-12", mes: "2026-11", situacao: "Atendido", nf: "com" }).map((p) => p.id)).toEqual(["ok"]);
    expect(filtrarPedidosFiscais(rows, { busca: "", mes: "todos", situacao: "todas", nf: "sem" }).map((p) => p.id)).toEqual(["sem"]);
  });
  it("redirects preservam filtros e a antiga tela de pedidos força sua aba", () => {
    expect(destinoNfsVenda("?nf_busca=42515")).toBe("/administrativo/contabilidade/nfs-venda?nf_busca=42515");
    expect(destinoNfsVenda("?pf_busca=1080&aba=notas", true)).toBe("/administrativo/contabilidade/nfs-venda?pf_busca=1080&aba=pedidos");
  });
});