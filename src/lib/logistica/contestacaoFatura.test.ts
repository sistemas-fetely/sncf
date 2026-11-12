import { describe, it, expect } from "vitest";
import { resumirContestacao, temAlgoAContestar } from "./contestacaoFatura";

describe("resumirContestacao", () => {
  it("acima da tabela soma o excedente (auditoria_diferenca)", () => {
    const r = resumirContestacao([
      { auditoria_status: "acima_referencia", auditoria_diferenca: 10.1, valor_frete: 100 },
      { auditoria_status: "acima_referencia", auditoria_diferenca: 0.2, valor_frete: 50 },
      { auditoria_status: "ok", auditoria_diferenca: 99, valor_frete: 10 },
    ]);
    expect(r.acimaQtd).toBe(2);
    expect(r.acimaExcedente).toBe(10.3);
  });
  it("a justificar soma valor_frete", () => {
    const r = resumirContestacao([
      { auditoria_status: "justificar", auditoria_diferenca: 5, valor_frete: 80 },
      { auditoria_status: "justificar", valor_frete: null },
    ]);
    expect(r.justificarQtd).toBe(2);
    expect(r.justificarValor).toBe(80);
    expect(r.acimaQtd).toBe(0);
  });
  it("sem nada a contestar", () => {
    const r = resumirContestacao([{ auditoria_status: "sem_referencia" }, { auditoria_status: null }]);
    expect(temAlgoAContestar(r)).toBe(false);
    expect(temAlgoAContestar({ ...r, justificarQtd: 1 })).toBe(true);
  });
});
