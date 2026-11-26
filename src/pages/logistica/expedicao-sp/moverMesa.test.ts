import { describe, expect, it } from "vitest";
import { lerResultadoMovimento, podeConfirmarMovimento, respostasMovimento } from "./moverMesa";

describe("movimentos da Mesa SP", () => {
  it("exige motivo apenas quando o destino exige", () => {
    expect(podeConfirmarMovimento(true, "  ", null, false)).toBe(false);
    expect(podeConfirmarMovimento(true, "Refazer embalagem", null, false)).toBe(true);
    expect(podeConfirmarMovimento(false, "", null, false)).toBe(true);
  });
  it("exige confirmação quando há pergunta", () => {
    expect(podeConfirmarMovimento(false, "", "Cancelar etiqueta?", false)).toBe(false);
    expect(podeConfirmarMovimento(false, "", "Cancelar etiqueta?", true)).toBe(true);
  });
  it("envia sim apenas após confirmação explícita", () => {
    expect(respostasMovimento(false)).toEqual({});
    expect(respostasMovimento(true)).toEqual({ cancelar_etiqueta: "sim" });
  });
  it("mantém a pergunta do banco como confirmação, não como sucesso", () => {
    expect(lerResultadoMovimento({ ok: false, pergunta: "cancelar_etiqueta", texto: "Confirmar AP123?" })).toEqual({ ok: false, pergunta: "cancelar_etiqueta", texto: "Confirmar AP123?" });
  });
  it("preserva destino e todos os avisos de sucesso", () => {
    expect(lerResultadoMovimento({ ok: true, de: "documentos", para: "embalagem", avisos: ["Etiqueta cancelada.", "Avise o Fiscal."] })).toEqual({ ok: true, de: "documentos", para: "embalagem", avisos: ["Etiqueta cancelada.", "Avise o Fiscal."] });
  });
  it("não disfarça respostas inesperadas como sucesso", () => {
    expect(() => lerResultadoMovimento(null)).toThrow();
    expect(() => lerResultadoMovimento({ ok: false })).toThrow();
    expect(() => lerResultadoMovimento({ ok: true, de: "fila", para: "separacao", avisos: [123] })).toThrow();
  });
});