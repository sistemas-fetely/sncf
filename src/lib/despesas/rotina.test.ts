import { describe, expect, it } from "vitest";
import { linhaPendente, rotuloMes, situacaoEntrada, situacaoMes } from "./rotina";

describe("rotina de contas a pagar", () => {
  it("entradas até três dias estão em dia", () => {
    expect(situacaoEntrada(0).tom).toBe("text-success");
    expect(situacaoEntrada(3).tom).toBe("text-success");
  });
  it("entradas de quatro a sete dias exigem atenção", () => {
    expect(situacaoEntrada(4).tom).toBe("text-warning");
    expect(situacaoEntrada(7).tom).toBe("text-warning");
  });
  it("entradas acima de sete dias e sem dados exigem importação", () => {
    expect(situacaoEntrada(8).tom).toBe("text-destructive");
    expect(situacaoEntrada(null).tom).toBe("text-destructive");
  });
  it("mês só está pronto com as duas quantidades zeradas", () => {
    expect(situacaoMes({ despesas_sem_conta: 0, debitos_sem_destino: 0 }).pendencias).toBe(0);
    expect(situacaoMes({ despesas_sem_conta: 0, debitos_sem_destino: 0 }).tom).toBe("text-success");
    expect(situacaoMes({ despesas_sem_conta: 2, debitos_sem_destino: 3 }).pendencias).toBe(5);
    expect(situacaoMes({ despesas_sem_conta: 0, debitos_sem_destino: 1 }).tom).toBe("text-warning");
  });
  it("formata a competência sem deslocamento de fuso", () => {
    expect(rotuloMes("2026-11")).toBe("Nov/2026");
    expect(rotuloMes("2026-01")).toBe("Jan/2026");
  });
  it("linha zerada fica esmaecida sem ação; pendência mantém ação", () => {
    expect(linhaPendente(0)).toEqual({ esmaecida: true, podeAbrir: false });
    expect(linhaPendente(1)).toEqual({ esmaecida: false, podeAbrir: true });
  });
});