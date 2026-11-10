import { describe, expect, it, vi } from "vitest";
import { acaoModalDespacho, executarAcaoModalMesa, transportadoraNfDiverge } from "./trocaModalMesa";

describe("troca individual de modal na Mesa SP", () => {
  it("avisa CC-e quando a transportadora da NF não corresponde ao novo modal", () => {
    expect(transportadoraNfDiverge("CORREIOS", null)).toBe(true);
    expect(transportadoraNfDiverge("CORREIOS", "CORREIOS")).toBe(false);
    expect(transportadoraNfDiverge("TRANSPORTADORA", null)).toBe(false);
  });
  it.each(["B2B", "B2C"])("%s volta para Documentos sem despachar ao trocar para Correios", async () => {
    const passos = { trocar: vi.fn().mockResolvedValue(undefined), agencia: vi.fn(), despachar: vi.fn(), documentos: vi.fn() };
    const acao = acaoModalDespacho({ atual: "TRANSPORTADORA", escolhido: "CORREIOS", correios: true, jaPostei: false });
    expect(acao).toBe("trocar");
    await executarAcaoModalMesa(acao, true, passos);
    expect(passos.trocar).toHaveBeenCalledOnce();
    expect(passos.documentos).toHaveBeenCalledOnce();
    expect(passos.despachar).not.toHaveBeenCalled();
    expect(passos.agencia).not.toHaveBeenCalled();
  });
  it("só a agência explicitamente escolhida segue para o despacho", async () => {
    const chamadas: string[] = [];
    const acao = acaoModalDespacho({ atual: "TRANSPORTADORA", escolhido: "CORREIOS", correios: true, jaPostei: true });
    await executarAcaoModalMesa(acao, true, { trocar: async () => { chamadas.push("trocar"); }, agencia: async () => { chamadas.push("agencia"); }, despachar: () => { chamadas.push("despachar"); }, documentos: vi.fn() });
    expect(chamadas).toEqual(["trocar", "agencia", "despachar"]);
  });
  it("pré-postagem viva recusada mantém o diálogo sem cancelar etiqueta nem despachar", async () => {
    const passos = { trocar: vi.fn().mockRejectedValue(new Error("Cancele a etiqueta antes de trocar o modal.")), agencia: vi.fn(), despachar: vi.fn(), documentos: vi.fn() };
    await expect(executarAcaoModalMesa("trocar", true, passos)).rejects.toThrow("Cancele a etiqueta");
    expect(passos.documentos).not.toHaveBeenCalled();
    expect(passos.despachar).not.toHaveBeenCalled();
  });
  it("Correios sem agência segue pelo rastreio e não despacha manualmente", async () => {
    const despachar = vi.fn();
    const acao = acaoModalDespacho({ atual: "CORREIOS", escolhido: "CORREIOS", correios: true, jaPostei: false });
    expect(acao).toBe("rastreio");
    await executarAcaoModalMesa(acao, false, { trocar: vi.fn(), agencia: vi.fn(), despachar, documentos: vi.fn() });
    expect(despachar).not.toHaveBeenCalled();
  });
});