import { describe, expect, it } from "vitest";
import { nfClienteConfirmada, type VinculoNfCliente } from "./nfCliente";

const v: VinculoNfCliente = { devolucao_id: "dev", nf_saida_id: "nf", status: "confirmado", classe: "devolucao_comercial", nfs_stage: { nf_numero: "42515" } };
describe("lastro fiscal da NF do cliente", () => {
  it("aceita vínculo confirmado pela devolução", () => expect(nfClienteConfirmada([v], "dev", null)).toEqual(v));
  it("aceita vínculo confirmado pela NF original sem devolucao_id", () => expect(nfClienteConfirmada([{ ...v, devolucao_id: null }], "dev", "nf")?.nfs_stage?.nf_numero).toBe("42515"));
  it("não aceita vínculo sugerido", () => expect(nfClienteConfirmada([{ ...v, status: "sugerido" }], "dev", "nf")).toBeNull());
  it("não aceita outra classe", () => expect(nfClienteConfirmada([{ ...v, classe: "retorno_remessa" }], "dev", "nf")).toBeNull());
  it("não aceita outra devolução e outra NF", () => expect(nfClienteConfirmada([v], "outra", "outra-nf")).toBeNull());
  it("null não liga notas ausentes", () => expect(nfClienteConfirmada([{ ...v, devolucao_id: null, nf_saida_id: null }], "dev", null)).toBeNull());
});