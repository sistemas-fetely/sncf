import { describe, expect, it } from "vitest";
import { grupoRetencao, obsPagaNoMes, recuarMeses } from "../../../supabase/functions/_shared/pacote-contador/retencoesGrupos";

const ini = "2026-11-01", fim = "2026-11-30";

describe("Retenções NFS-e — grupos pela data do pagamento", () => {
  it("emitida no mês entra no grupo (a), pago ou não", () => {
    expect(grupoRetencao("2026-11-03", null, ini, fim)).toBe("emitida");
    expect(grupoRetencao("2026-11-03", "2026-12-02", ini, fim)).toBe("emitida");
  });
  it("NFS-e 7827: emitida 15/09, paga em novembro → grupo (b) de novembro", () => {
    expect(grupoRetencao("2026-09-15", "2026-11-10", ini, fim)).toBe("paga_no_mes");
  });
  it("emitida antes e paga em outro mês não entra em novembro", () => {
    expect(grupoRetencao("2026-09-15", "2026-10-20", ini, fim)).toBeNull();
  });
  it("emitida antes, sem pagamento, dentro de 12 meses → em aberto", () => {
    expect(grupoRetencao("2026-09-15", null, ini, fim)).toBe("em_aberto");
    expect(grupoRetencao("2025-11-01", null, ini, fim)).toBe("em_aberto");
  });
  it("sem pagamento há mais de 12 meses fica fora", () => {
    expect(grupoRetencao("2025-10-31", null, ini, fim)).toBeNull();
    expect(recuarMeses("2026-01-01", 12)).toBe("2025-01-01");
  });
  it("observação do grupo (b)", () => {
    expect(obsPagaNoMes("2026-09-15", "2026-11-10")).toBe("emitida em 09/2026, paga em 10/11/2026");
  });
});
