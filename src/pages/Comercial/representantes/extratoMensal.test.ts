import { describe, expect, it } from "vitest";
import { ajustesDoExtrato, carteiraPorPedido, pagamentosDoExtrato } from "./extratoMensal";

describe("prestação de contas mensal", () => {
  it("seleciona somente liberações do detalhe e usa valor_liberado da view", () => {
    const parcelas = [{ liberacao_id: "a", cliente: "Z", valor_liberado: 421.72 }, { liberacao_id: "b", cliente: "A", valor_liberado: 148.01 }, { liberacao_id: "fora", valor_liberado: 99 }];
    expect(pagamentosDoExtrato([{ tipo: "liberacao", liberacao_id: "a" }, { tipo: "liberacao", liberacao_id: "b" }], parcelas).map(p => p.valor_liberado)).toEqual([148.01, 421.72]);
  });
  it("não inclui complemento nas parcelas e explica complemento e estorno nos ajustes", () => {
    const itens = [{ tipo: "liberacao", subtipo: "complemento", valor: 22.2 }, { tipo: "estorno", valor: -10 }];
    expect(pagamentosDoExtrato(itens, [])).toEqual([]);
    expect(ajustesDoExtrato(itens).map(i => i.valor)).toEqual([22.2, -10]);
  });
  it("falha claramente quando uma liberação não tem parcela correspondente", () => {
    expect(() => pagamentosDoExtrato([{ tipo: "liberacao", liberacao_id: "ausente" }], [])).toThrow("Liberação ausente");
  });
  it("agrupa a vencer por pedido com quantidade, próximo vencimento e soma da comissão", () => {
    const linhas = [{ pedido: "PED-1", cliente: "A", situacao_parcela: "a_vencer", vencimento: "2026-11-10", comissao_da_parcela: 100 }, { pedido: "PED-1", cliente: "A", situacao_parcela: "a_vencer", vencimento: "2026-12-10", comissao_da_parcela: 50 }, { pedido: "PED-1", cliente: "A", situacao_parcela: "liberada", comissao_da_parcela: 500 }];
    expect(carteiraPorPedido(linhas, "a_vencer")).toEqual([{ pedido: "PED-1", cliente: "A", parcelas: 2, vencimento: "2026-11-10", dias_atraso: 0, comissao: 150 }]);
  });
  it("seleciona somente vencidas e mantém a mais antiga e maior atraso", () => {
    const linhas = [{ pedido: "P", cliente: "A", situacao_parcela: "vencida", vencimento: "2026-09-01", dias_atraso: 35, comissao_da_parcela: 22 }, { pedido: "P", cliente: "A", situacao_parcela: "vencida", vencimento: "2026-10-01", dias_atraso: 5, comissao_da_parcela: 10 }, { pedido: "X", situacao_parcela: "a_vencer", comissao_da_parcela: 100 }];
    expect(carteiraPorPedido(linhas, "vencida")[0]).toMatchObject({ parcelas: 2, vencimento: "2026-09-01", dias_atraso: 35, comissao: 32 });
  });
});