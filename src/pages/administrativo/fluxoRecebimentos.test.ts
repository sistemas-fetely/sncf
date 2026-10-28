import { describe, it, expect } from "vitest";
import { agruparPeriodos, noHorizonte, rotuloPeriodo, chavePeriodo, type Recebivel } from "./fluxoRecebimentos";

const r = (p: Partial<Recebivel>): Recebivel => ({
  origem_id: Math.random().toString(), origem: "titulo", numero_titulo: null, pedido_id: null, cliente: null,
  canal: "Pix", qualidade: "firme", eh_firme: true, data_vencimento_atual: null, dia_credito: null, regra_data: null,
  eh_atrasado: false, dias_atraso: 0, valor_liquido: 0, valor_bruto: 0, taxa_ausente: false, instrumento: null, ...p,
});

describe("fluxo de recebimentos", () => {
  it("semana vai de segunda a domingo no formato 26/10 – 01/11", () => {
    expect(chavePeriodo("2026-10-29", "semana")).toBe("2026-10-26");
    expect(rotuloPeriodo("2026-10-26", "semana")).toBe("26/10 – 01/11");
  });

  it("atrasados não entram nos períodos e o acumulado soma em ordem", () => {
    const ps = agruparPeriodos([
      r({ dia_credito: "2026-11-03", valor_liquido: 50, eh_firme: false }),
      r({ dia_credito: "2026-10-28", valor_liquido: 100 }),
      r({ dia_credito: "2026-10-20", valor_liquido: 999, eh_atrasado: true }),
    ], "semana");
    expect(ps.map((p) => p.total)).toEqual([100, 50]);
    expect(ps.map((p) => p.acumulado)).toEqual([100, 150]);
    expect(ps[1].incerto).toBe(50);
  });

  it("horizonte exclui atrasados e datas além do limite", () => {
    const xs = noHorizonte([
      r({ dia_credito: "2026-11-04" }), r({ dia_credito: "2026-11-05" }),
      r({ dia_credito: "2026-10-30", eh_atrasado: true }),
    ], "2026-10-28", 7);
    expect(xs.length).toBe(1);
  });
});
