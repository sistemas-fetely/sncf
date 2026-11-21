import { describe, expect, it } from "vitest";
import { mostrarRessarcimentoExtrato, validarResultadoRessarcimento } from "./ressarcimentoExtrato";
const base = { desfecho: "reembolso", status: "aberta", status_efetivo: "aberta", e6_ressarcida: false, e7_encerrada: false, ressarcimento_mov_id: null };
describe("ressarcimento por extrato", () => {
  it("mostra reembolso aberto sem ressarcimento", () => expect(mostrarRessarcimentoExtrato(base)).toBe(true));
  it.each(["encerrada", "cancelada"])("não oferece vínculo para %s sem vínculo", status => expect(mostrarRessarcimentoExtrato({ ...base, status_efetivo: status })).toBe(false));
  it("não oferece vínculo após cumprir e6", () => expect(mostrarRessarcimentoExtrato({ ...base, e6_ressarcida: true })).toBe(false));
  it("não oferece vínculo após cumprir e7", () => expect(mostrarRessarcimentoExtrato({ ...base, e7_encerrada: true })).toBe(false));
  it.each(["haver", "troca", "nenhum", null])("não oferece ressarcimento para desfecho %s", desfecho => expect(mostrarRessarcimentoExtrato({ ...base, desfecho })).toBe(false));
  it.each(["encerrada", "cancelada", "aberta"])("vínculo existente permanece visível em %s mesmo com e6 cumprida", status => expect(mostrarRessarcimentoExtrato({ ...base, status_efetivo: status, e6_ressarcida: true, ressarcimento_mov_id: "movimento" })).toBe(true));
  it("mensagem de recusa do banco não é engolida", () => expect(() => validarResultadoRessarcimento({ ok: false, erro: "Só devolução com desfecho reembolso recebe ressarcimento por extrato" })).toThrow("Só devolução com desfecho reembolso recebe ressarcimento por extrato"));
  it("preserva diferença e encerramento devolvidos pelo banco", () => {
    const r = { ok: true, diferenca: 2.34, encerramento: { encerrou: true, pendencias: [] } };
    expect(validarResultadoRessarcimento(r)).toBe(r);
  });
});