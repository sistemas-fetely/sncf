import { describe, it, expect } from "vitest";
import { linhaTrsRetorno } from "./trsRetorno";

const base = { id: "d1", trs_numero: "TRS-0012", nf_numero: null, erro: null };

describe("linhaTrsRetorno", () => {
  it("sem natureza fiscal ligada avisa a Eva e não oferece tentar de novo", () => {
    const l = linhaTrsRetorno({ ...base, situacao: "aguardando_natureza" });
    expect(l.texto).toContain("Aguardando natureza fiscal da transferência (CFOP) — Eva");
    expect(l.podeTentar).toBe(false);
  });
  it("falha na criação é erro com Tentar de novo", () => {
    const l = linhaTrsRetorno({ ...base, trs_numero: null, situacao: "erro_criacao", erro: "Sem entrada" });
    expect(l.tom).toBe("erro");
    expect(l.podeTentar).toBe(true);
  });
  it("NF autorizada fica ok", () => {
    expect(linhaTrsRetorno({ ...base, situacao: "autorizada", nf_numero: "000950" }).tom).toBe("ok");
  });
});
