import { describe, expect, it } from "vitest";
import { competenciaApurada, saldosAnterioresDoExtrato } from "./extratoMensal";
import { assunto, linhaDoItem, prazoNf } from "../../../../supabase/functions/enviar-extrato-comissao/email";

describe("competenciaApurada", () => {
  it("pagamento 11/2026 → competência 10/2026", () => expect(competenciaApurada("2026-11-01")).toBe("2026-10-01"));
  it("vira o ano: pagamento 01/2027 → 12/2026", () => expect(competenciaApurada("2027-01")).toBe("2026-12-01"));
  it("saldo em aberto mostra o mês apurado da origem", () => {
    const [s] = saldosAnterioresDoExtrato([{ tipo: "saldo_anterior", competencia_origem: "2026-10-01", valor: 10 }]);
    expect(s.rotulo).toBe("Saldo em aberto de 09/2026");
  });
});

describe("e-mail do extrato", () => {
  const e = { competencia: "2026-11-01", competencia_apuracao: "2026-10-01" };
  it("prazo da NF é dia 10 do mês de pagamento", () => expect(prazoNf(e.competencia)).toBe("10/11"));
  it("assunto usa a competência apurada", () => expect(assunto(e)).toBe("Fetély · Extrato de comissão 10/2026 — emitir NF até 10/11"));
  it("saldo_anterior aparece com mês apurado, nº e motivo padrão", () => {
    const h = linhaDoItem({ tipo: "saldo_anterior", competencia_origem: "2026-10-01", sequencia_origem: 2, valor: 100 });
    expect(h).toContain("Saldo em aberto de 09/2026");
    expect(h).toContain("(nº 2)");
    expect(h).toContain("Valor fechado no mês anterior e ainda não pago");
    expect(h).toContain('colspan="4"');
  });
  it("complemento em célula única com NF e pedido", () => {
    const h = linhaDoItem({ tipo: "liberacao", subtipo: "complemento", nf: "123", pedido: "PED-1", valor: 5 });
    expect(h).toContain("<strong>Complemento</strong> — NF 123 · PED-1");
  });
  it("estorno em vermelho com rótulo e parcial", () => {
    const h = linhaDoItem({ tipo: "estorno", estorno_tipo: "devolucao", parcial: true, motivo: "<x>", valor: -5 });
    expect(h).toContain("#b91c1c");
    expect(h).toContain("<strong>Devolução (parcial)</strong> — &lt;x&gt;");
  });
});
