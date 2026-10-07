import { describe, expect, it } from "vitest";
import { agendaRecebiveis, ajustesDoExtrato, baseDaLiberacao, pagamentosDoExtrato, parcelasEmAtraso, representantesDoLote, rotuloTaxas, somarMeses } from "./extratoMensal";
import { competenciaFechada, dataDoFechamento } from "./extratoCompetencias";

describe("prestação de contas mensal", () => {
  it("preserva base e taxas por linha na agenda futura e paga pendente", () => {
    const ag = agendaRecebiveis([
      { situacao_parcela: "a_vencer", vencimento: "2026-10-20", base_parcela: "1250", taxas_linhas: [8], comissao_da_parcela: 100 },
      { situacao_parcela: "paga_aguarda_liberacao", pago_em: "2026-10-01", base_parcela: 2000, taxas_linhas: [8, 10], valor_liberado: 180 },
    ], [], [], "2026-10");
    expect(ag[0].itens.map(i => [i.base, i.taxas, i.comissao])).toEqual([[2000, [8, 10], 180], [1250, [8], 100]]);
    expect(ag[0].total).toBe(280);
  });
  it("complementos pendentes e de extrato futuro não têm base nem taxa", () => {
    const ag = agendaRecebiveis([], [{ valor: 22.2, competencia_pagamento: "2026-11-01" }], [{ competencia: "2026-12-01", detalhe: [{ tipo: "liberacao", subtipo: "complemento", liberacao_id: "c", valor: 10 }] }], "2026-10");
    expect(ag.flatMap(m => m.itens).map(i => [i.parcela, i.base, i.taxas, i.comissao])).toEqual([["complemento", null, null, 22.2], ["complemento", null, null, 10]]);
  });
  it("preserva a base e as taxas originais das parcelas vencidas", () => {
    const parcelas = [{ situacao_parcela: "vencida", base_parcela: 1014.89, taxas_linhas: [8], comissao_da_parcela: 81.19 }];
    expect(parcelasEmAtraso(parcelas)[0]).toEqual(parcelas[0]);
  });
  it("calcula a base proporcional usada na liberação e arredonda em centavos", () => {
    expect(baseDaLiberacao({ base_parcela: 5271.55, valor_liberado: 421.72, comissao_da_parcela: 421.724 })).toBe(5271.5);
  });
  it("usa a base integral quando a comissão original não é positiva", () => {
    expect(baseDaLiberacao({ base_parcela: 465.04, valor_liberado: 27.9, comissao_da_parcela: 0 })).toBe(465.04);
  });
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
  it("mostra a taxa de cada linha de produto, nunca a média", () => {
    expect(rotuloTaxas([6])).toBe("6%");
    expect(rotuloTaxas([8, 10])).toBe("8% / 10%");
    expect(rotuloTaxas(null)).toBe("—");
  });
  it("preserva a data de fechamento existente no primeiro dia do mês seguinte", () => {
    expect(dataDoFechamento("2026-10")).toBe("01/10");
    expect(competenciaFechada("2026-10", "2026-09-30")).toBe(false);
    expect(competenciaFechada("2026-10", "2026-10-01")).toBe(true);
    expect(competenciaFechada("2026-12", "2026-12-01")).toBe(true);
  });
  it("agenda: a vencer recebe no mês seguinte ao vencimento, uma linha por parcela", () => {
    const parcelas = [
      { cliente: "A", pedido: "P1", numero_parcela: 2, total_parcelas: 4, situacao_parcela: "a_vencer", vencimento: "2026-10-20", comissao_da_parcela: 100 },
      { cliente: "A", pedido: "P1", numero_parcela: 3, total_parcelas: 4, situacao_parcela: "a_vencer", vencimento: "2026-11-20", comissao_da_parcela: 50 },
    ];
    const ag = agendaRecebiveis(parcelas, [], [], "2026-10");
    expect(ag.map(m => [m.mes, m.total, m.itens.length, m.pagarAte])).toEqual([["2026-11", 100, 1, "2026-11-15"], ["2026-12", 50, 1, "2026-12-15"]]);
    expect(ag[0].itens[0].parcela).toBe("2/4");
  });
  it("agenda: parcela já paga em extrato futuro cai no mês daquele extrato com valor_liberado", () => {
    const extratos = [{ competencia: "2026-11-01", pagar_ate: "2026-11-15", detalhe: [{ tipo: "liberacao", liberacao_id: "x" }] }, { competencia: "2026-09-01", detalhe: [{ tipo: "liberacao", liberacao_id: "velha" }] }];
    const parcelas = [
      { pedido: "PED-2153", numero_parcela: 2, total_parcelas: 4, situacao_parcela: "liberada", liberacao_id: "x", pago_em: "2026-10-01", valor_liberado: 411.13, comissao_da_parcela: 400 },
      { pedido: "PED-2153", numero_parcela: 1, total_parcelas: 4, situacao_parcela: "liberada", liberacao_id: "velha", valor_liberado: 10 },
    ];
    const ag = agendaRecebiveis(parcelas, [], extratos, "2026-10");
    expect(ag).toHaveLength(1);
    expect(ag[0]).toMatchObject({ mes: "2026-11", total: 411.13 });
    expect(ag[0].itens[0]).toMatchObject({ pago: true, vencimento: "2026-10-01" });
  });
  it("agenda: paga aguardando sem competência usa pago_em + 1; complemento usa competencia_pagamento", () => {
    const ag = agendaRecebiveis([{ situacao_parcela: "paga_aguarda_liberacao", pago_em: "2026-10-05", comissao_da_parcela: 30 }], [{ pedido: "PED-2187", cliente: "FZL", valor: "22.20", competencia_pagamento: "2026-11-01" }], [], "2026-10");
    expect(ag).toHaveLength(1);
    expect(ag[0].total).toBeCloseTo(52.2, 2);
    expect(ag[0].itens.find(i => i.parcela === "complemento")?.comissao).toBe(22.2);
  });
  it("agenda não inclui vencidas; atraso lista uma por linha", () => {
    const parcelas = [{ situacao_parcela: "vencida", vencimento: "2026-09-01", comissao_da_parcela: 81.19 }, { situacao_parcela: "vencida", vencimento: "2026-08-01", comissao_da_parcela: 5 }];
    expect(agendaRecebiveis(parcelas, [], [], "2026-10")).toEqual([]);
    expect(parcelasEmAtraso(parcelas).map(p => p.vencimento)).toEqual(["2026-08-01", "2026-09-01"]);
  });
  it("somarMeses atravessa o ano", () => {
    expect(somarMeses("2026-12-10", 1)).toBe("2027-01");
    expect(somarMeses("2026-01", -1)).toBe("2025-12");
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
