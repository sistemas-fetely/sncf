import { describe, expect, it } from "vitest";
import { podeMarcarNaoEntregue, rotuloDesfecho } from "./naoEntregue";

describe("botão Não entregue", () => {
  const base = { nao_entregue: false, recebido_em: null, nf_dev_status: null };
  it("aparece sem recebimento, sem NF e não marcado", () => expect(podeMarcarNaoEntregue(base)).toBe(true));
  it("some com recebimento", () => expect(podeMarcarNaoEntregue({ ...base, recebido_em: "2026-11-24" })).toBe(false));
  it("some com NF de devolução", () => expect(podeMarcarNaoEntregue({ ...base, nf_dev_status: "rascunho" })).toBe(false));
  it("some quando já marcado", () => expect(podeMarcarNaoEntregue({ ...base, nao_entregue: true })).toBe(false));
});

describe("rótulo do desfecho", () => {
  it("sem_ressarcimento", () => expect(rotuloDesfecho("sem_ressarcimento")).toBe("Sem ressarcimento (nada pago)"));
});
