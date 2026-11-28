import { describe, expect, it } from "vitest";
import { cardsVisao, freteSobreFaturamento, listaVisao, matrizVisao, mesesDoPeriodo, type FaturaCusto } from "./visaoCusto";
let i = 0;
const fat = (p: Partial<FaturaCusto>): FaturaCusto => ({ fatura_id: `f${++i}`, transportadora_id: "icaro", transportadora: "Ícaro", canal: "b2b", numero_fatura: String(i), data_emissao: null, data_vencimento: null, valor_total: 0, conta_pagar_id: null, titulo_status: null, valor_pago: 0, saldo: 0, estado_pagamento: "pago", data_pagamento: null, sugestao_mov_id: null, sugestao_mov_data: null, sugestao_mov_descricao: null, data_caixa: null, data_competencia: null, ...p });
const per = { de: "2026-08-27", ate: "2026-11-27" };
// 10 faturas pagas da Ícaro somando 18.556,19
const valores = [1850.5, 2100.33, 1740.12, 1995.4, 1620.88, 2010.0, 1888.77, 1702.19, 1830.0, 1818.0];
const icaro = valores.map((v, k) => fat({ valor_pago: v, valor_total: v, data_caixa: `2026-${String(9 + (k % 3)).padStart(2, "0")}-1${k % 9}`, data_competencia: "2026-08-01" }));

describe("visão de custo do frete", () => {
  it("Ícaro, lente Caixa, 27/08–27/11/2026: Pago 18.556,19 em 10 faturas", () => {
    const fora = [fat({ valor_pago: 999, data_caixa: "2026-08-26" }), fat({ valor_pago: 500, data_caixa: "2026-11-28" })];
    const c = cardsVisao([...icaro, ...fora], "caixa", per);
    expect(c.pago).toBe(18556.19); expect(c.pagoFaturas).toBe(10);
  });
  it("pago sem conciliar soma saldo de pago_sem_conciliar e pago_sem_titulo; total saído soma os dois", () => {
    const c = cardsVisao([fat({ valor_pago: 100, data_caixa: "2026-09-01" }), fat({ estado_pagamento: "pago_sem_conciliar", saldo: 30, data_caixa: "2026-09-02" }), fat({ estado_pagamento: "pago_sem_titulo", saldo: 20, data_caixa: "2026-09-03" })], "caixa", per);
    expect(c).toMatchObject({ pago: 100, pagoSemConciliar: 50, totalSaido: 150 });
  });
  it("a vencer, vencido e sem título ignoram o período", () => {
    const c = cardsVisao([fat({ estado_pagamento: "a_vencer", saldo: 10, data_caixa: "2020-01-01" }), fat({ estado_pagamento: "vencido", saldo: 5, data_vencimento: "2025-03-02" }), fat({ estado_pagamento: "vencido", saldo: 7, data_vencimento: "2026-01-01" }), fat({ estado_pagamento: "sem_titulo", valor_total: 40 })], "caixa", per);
    expect(c).toMatchObject({ aVencer: 10, vencido: 12, vencidoMaisAntiga: "2025-03-02", semTitulo: 40 });
  });
  it("cobrado (competência) exclui cancelado", () => {
    const c = cardsVisao([fat({ valor_total: 100, data_competencia: "2026-09-01", estado_pagamento: "a_vencer" }), fat({ valor_total: 50, data_competencia: "2026-09-01", estado_pagamento: "cancelado" })], "competencia", per);
    expect(c.cobrado).toBe(100);
  });
  it("frete ÷ faturamento soma todos os canais dos meses que tocam o período", () => {
    const r = [{ mes: "2026-08-01", receita_total: 600 }, { mes: "2026-11-01", receita_total: 400 }, { mes: "2026-07-01", receita_total: 9000 }, { mes: "2026-08-01", receita_total: 0 }];
    expect(freteSobreFaturamento(100, r, per)).toBe(10);
    expect(freteSobreFaturamento(100, [], per)).toBeNull();
  });
  it("meses do período incluem os de borda", () => {
    expect(mesesDoPeriodo(per)).toEqual(["2026-08", "2026-09", "2026-10", "2026-11"]);
  });
  it("matriz caixa soma pago + saldo dos pago_sem_* por transportadora e mês", () => {
    const m = matrizVisao([fat({ valor_pago: 100, data_caixa: "2026-10-05" }), fat({ estado_pagamento: "pago_sem_conciliar", saldo: 25, data_caixa: "2026-10-09" }), fat({ transportadora_id: "x", transportadora: "X", valor_pago: 10, data_caixa: "2026-09-01" })], "caixa", per);
    expect(m.linhas[0]).toMatchObject({ id: "icaro", total: 125, celulas: { "2026-10": 125 } });
    expect(m.colunas["2026-09"]).toBe(10); expect(m.total).toBe(135);
  });
  it("lista inclui pendências fora do período e as ordena primeiro", () => {
    const l = listaVisao([fat({ estado_pagamento: "a_vencer", data_caixa: "2026-09-01", data_vencimento: "2026-12-01" }), fat({ estado_pagamento: "sem_titulo", data_vencimento: "2020-01-01" }), fat({ estado_pagamento: "vencido", data_vencimento: "2021-01-01" }), fat({ estado_pagamento: "pago", data_caixa: "2020-01-01" })], "caixa", per);
    expect(l.map((f) => f.estado_pagamento)).toEqual(["vencido", "sem_titulo", "a_vencer"]);
  });
});
