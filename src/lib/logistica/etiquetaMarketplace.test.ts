import { describe, expect, it, vi } from "vitest";
import { confirmarEtiquetaMarketplace, type EtiquetaMarketplace } from "./etiquetaMarketplace";
const etiqueta: EtiquetaMarketplace = { ok: true, bling_pedido_id: "123", formato: "PDF", pdf_base64: "JVBERg==", arquivos: ["label.pdf"] };
describe("confirmação de etiqueta marketplace", () => {
  it("registra anotação com Bling id e formato antes de liberar o documento", async () => {
    const ordem: string[] = [];
    const anotar = vi.fn(async () => { ordem.push("anotar"); });
    await confirmarEtiquetaMarketplace(etiqueta, anotar, async () => { ordem.push("marcar"); });
    expect(anotar).toHaveBeenCalledWith("Etiqueta do marketplace impressa (Bling id 123)", { origem: "bling", formato: "PDF" });
    expect(ordem).toEqual(["anotar", "marcar"]);
  });
  it("ZPL sem conteúdo nunca marca nem anota impressão", async () => {
    const anotar = vi.fn(), marcar = vi.fn();
    await expect(confirmarEtiquetaMarketplace({ ...etiqueta, formato: "ZPL" }, anotar, marcar)).rejects.toThrow("sem conteúdo");
    expect(anotar).not.toHaveBeenCalled(); expect(marcar).not.toHaveBeenCalled();
  });
  it("ZPL impresso registra seu formato e marca o documento", async () => {
    const anotar = vi.fn(), marcar = vi.fn();
    await confirmarEtiquetaMarketplace({ ...etiqueta, formato: "ZPL", zpl: "^XA^XZ" }, anotar, marcar);
    expect(anotar).toHaveBeenCalledWith("Etiqueta do marketplace impressa (Bling id 123)", { origem: "bling", formato: "ZPL" });
    expect(marcar).toHaveBeenCalledOnce();
  });
  it("falha na anotação impede liberação e preserva erro", async () => {
    const marcar = vi.fn();
    await expect(confirmarEtiquetaMarketplace(etiqueta, async () => { throw new Error("Sem permissão"); }, marcar)).rejects.toThrow("Sem permissão");
    expect(marcar).not.toHaveBeenCalled();
  });
  it("falha na marcação não é escondida", async () => {
    await expect(confirmarEtiquetaMarketplace(etiqueta, async () => {}, async () => { throw new Error("Documento inválido"); })).rejects.toThrow("Documento inválido");
  });
});