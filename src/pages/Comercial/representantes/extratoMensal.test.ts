import { describe, expect, it } from "vitest";
import { ajustesDoExtrato, carteiraPorPedido, complementosNaCarteira, liberacoesEmExtratos, pagamentosDoExtrato, representantesDoLote, rotuloParcelas, rotuloTaxas } from "./extratoMensal";
import { competenciaFechada, dataDoFechamento } from "./extratoCompetencias";

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
    expect(carteiraPorPedido(linhas, "a_vencer")).toEqual([{ pedido: "PED-1", cliente: "A", parcelas: 2, vencimento: "2026-11-10", dias_atraso: 0, comissao: 150, parcelas_lista: [], total_parcelas: 0 }]);
  });
  it("mostra o intervalo das parcelas a vencer sobre o total", () => {
    expect(rotuloParcelas([2, 3, 4], 4)).toBe("2 a 4 de 4");
    expect(rotuloParcelas([4], 4)).toBe("4 de 4");
    expect(rotuloParcelas([2, 4], 4)).toBe("2, 4 de 4");
  });
  it("carteiraPorPedido devolve a lista de numero_parcela e o total do pedido", () => {
    const linhas = [
      { pedido_id: "p1", pedido: "PED-2172", cliente: "A", situacao_parcela: "a_vencer", numero_parcela: 2, comissao_da_parcela: 10 },
      { pedido_id: "p1", pedido: "PED-2172", cliente: "A", situacao_parcela: "a_vencer", numero_parcela: 3, comissao_da_parcela: 10 },
      { pedido_id: "p1", pedido: "PED-2172", cliente: "A", situacao_parcela: "a_vencer", numero_parcela: 4, comissao_da_parcela: 10 },
      { pedido_id: "p1", pedido: "PED-2172", cliente: "A", situacao_parcela: "liberada", numero_parcela: 1, comissao_da_parcela: 10 },
    ];
    expect(carteiraPorPedido(linhas, "a_vencer")[0]).toMatchObject({ parcelas_lista: [2, 3, 4], total_parcelas: 4 });
  });
  it("seleciona somente vencidas e mantém a mais antiga e maior atraso", () => {
    const linhas = [{ pedido: "P", cliente: "A", situacao_parcela: "vencida", vencimento: "2026-09-01", dias_atraso: 35, comissao_da_parcela: 22 }, { pedido: "P", cliente: "A", situacao_parcela: "vencida", vencimento: "2026-10-01", dias_atraso: 5, comissao_da_parcela: 10 }, { pedido: "X", situacao_parcela: "a_vencer", comissao_da_parcela: 100 }];
    expect(carteiraPorPedido(linhas, "vencida")[0]).toMatchObject({ parcelas: 2, vencimento: "2026-09-01", dias_atraso: 35, comissao: 32 });
  });
  it("mostra a taxa de cada linha de produto, nunca a média", () => {
    expect(rotuloTaxas([6])).toBe("6%");
    expect(rotuloTaxas([8, 10])).toBe("8% / 10%");
    expect(rotuloTaxas(null)).toBe("—");
  });
  it("complemento pendente entra no A receber com o valor como comissão", () => {
    expect(complementosNaCarteira([{ cliente: "FZL", pedido: "PED-2187", valor: "22.20" }])).toEqual([{ cliente: "FZL", pedido: "PED-2187", comissao: 22.2, complemento: true }]);
  });
  it("preserva a data de fechamento existente no primeiro dia do mês seguinte", () => {
    expect(dataDoFechamento("2026-10")).toBe("01/11");
    expect(competenciaFechada("2026-10", "2026-10-31")).toBe(false);
    expect(competenciaFechada("2026-10", "2026-11-01")).toBe(true);
    expect(competenciaFechada("2026-12", "2027-01-01")).toBe(true);
  });
  it("inclui a parcela 2 já paga de PED-2153 sem usar seu vencimento passado", () => {
    const parcelas = [
      { cliente: "A", pedido: "PED-2153", numero_parcela: 2, total_parcelas: 5, situacao_parcela: "paga_aguarda_liberacao", vencimento: "2026-09-10", comissao_da_parcela: 411.13 },
      { cliente: "A", pedido: "PED-2153", numero_parcela: 3, total_parcelas: 5, situacao_parcela: "a_vencer", vencimento: "2026-11-10", comissao_da_parcela: 411.13 },
    ];
    expect(carteiraPorPedido(parcelas, "a_vencer", new Set())[0]).toMatchObject({ comissao: 822.26, parcelas_lista: [2, 3], total_parcelas: 5, vencimento: "2026-11-10" });
  });
  it("exclui liberações de qualquer extrato e usa valor_liberado nas ainda não incluídas", () => {
    const ids = liberacoesEmExtratos([{ competencia: "2026-09-01", detalhe: [{ liberacao_id: "antiga" }] }, { competencia: "2026-11-01", detalhe: [{ liberacao_id: "futura" }] }]);
    const parcelas = ["antiga", "futura", "pendente"].map(liberacao_id => ({ cliente: "A", pedido: "P", liberacao_id, situacao_parcela: "liberada", valor_liberado: 22.2, comissao_da_parcela: 100, vencimento: "2026-09-10" }));
    expect(carteiraPorPedido(parcelas, "a_vencer", ids)[0]).toMatchObject({ comissao: 22.2, parcelas: 1, vencimento: null });
  });
  it("total a receber soma futuras, pagas pendentes, liberadas fora do extrato e complementos sem vencidas", () => {
    const parcelas = [
      { pedido: "P", situacao_parcela: "a_vencer", comissao_da_parcela: 100 },
      { pedido: "P", situacao_parcela: "paga_aguarda_liberacao", comissao_da_parcela: 411.13 },
      { pedido: "P", situacao_parcela: "liberada", liberacao_id: "nova", valor_liberado: 50 },
      { pedido: "P", situacao_parcela: "vencida", comissao_da_parcela: 999 },
    ];
    const linhas = [...carteiraPorPedido(parcelas, "a_vencer", new Set()), ...complementosNaCarteira([{ cliente: "FZL", pedido: "PED-2187", valor: 22.2 }])];
    expect(linhas.reduce((s, l) => s + l.comissao, 0)).toBeCloseTo(583.33, 2);
  });
  it("inclui no lote extrato do mês, futuras, pagas pendentes, vencidas e complementos, não liberações já pagas", () => {
    const extratos = [{ vendedor_id: "quitado", competencia: "2026-09-01", detalhe: [{ liberacao_id: "paga" }] }, { vendedor_id: "extrato", competencia: "2026-10-01" }];
    const parcelas = [
      { vendedor_id: "quitado", situacao_parcela: "liberada", liberacao_id: "paga" },
      { vendedor_id: "futuro", situacao_parcela: "a_vencer" },
      { vendedor_id: "pendente", situacao_parcela: "paga_aguarda_liberacao" },
      { vendedor_id: "liberado", situacao_parcela: "liberada", liberacao_id: "nova" },
      { vendedor_id: "atrasado", situacao_parcela: "vencida" },
    ];
    expect(representantesDoLote(extratos, parcelas, [{ vendedor_id: "complemento", valor: 22.2 }], "2026-10")).toEqual(["extrato", "futuro", "pendente", "liberado", "atrasado", "complemento"]);
  });
});
