import { describe, expect, it } from "vitest";
import { aguardandoComprovanteVD, finalizadaVD } from "./finalizadaVD";

describe("finalizadaVD", () => {
  it("concluída sem comprovante enviado segue em andamento", () => {
    expect(finalizadaVD({ status: "concluida", comprovante_enviado_em: null })).toBe(false);
    expect(aguardandoComprovanteVD({ status: "concluida", comprovante_enviado_em: null })).toBe(true);
  });
  it("concluída com comprovante enviado está finalizada", () => {
    expect(finalizadaVD({ status: "concluida", comprovante_enviado_em: "2026-10-27T12:00:00Z" })).toBe(true);
    expect(aguardandoComprovanteVD({ status: "concluida", comprovante_enviado_em: "2026-10-27T12:00:00Z" })).toBe(false);
  });
  it("recusada está finalizada", () => {
    expect(finalizadaVD({ status: "recusada" })).toBe(true);
  });
  it("status intermediários seguem em andamento", () => {
    for (const s of ["solicitada", "aprovada", "aguardando_devolucao", "estorno_enviado", "falhou"]) expect(finalizadaVD({ status: s })).toBe(false);
  });
});
