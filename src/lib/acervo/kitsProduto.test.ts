import { describe, expect, it } from "vitest";
import { descontoKit, filtrarKits, normalizarCodigoKit, type KitLinha } from "./kitsProduto";

const k = (sku: string, ativo: boolean, no_bling: boolean, nome = sku) => ({ sku, nome, ativo, no_bling } as KitLinha);
const lista = [k("KB", true, false, "Kit festa"), k("KA", true, true), k("KC", false, true)];

describe("kits do produto", () => {
  it("padrão mostra só ativos, ordenados por código", () => {
    expect(filtrarKits(lista, { busca: "", situacao: "ativos", bling: "todos" }).map(x => x.sku)).toEqual(["KA", "KB"]);
  });
  it("filtra inativos e fora do Bling", () => {
    expect(filtrarKits(lista, { busca: "", situacao: "inativos", bling: "todos" }).map(x => x.sku)).toEqual(["KC"]);
    expect(filtrarKits(lista, { busca: "", situacao: "todos", bling: "nao" }).map(x => x.sku)).toEqual(["KB"]);
  });
  it("busca por nome", () => {
    expect(filtrarKits(lista, { busca: "festa", situacao: "todos", bling: "todos" }).map(x => x.sku)).toEqual(["KB"]);
  });
  it("desconto do kit em R$ e %", () => {
    expect(descontoKit(200, 150)).toEqual({ valor: 50, pct: 25 });
    expect(descontoKit(null, 150)).toBeNull();
    expect(descontoKit(200, null)).toBeNull();
  });
  it("código em maiúsculas e sem espaço", () => {
    expect(normalizarCodigoKit("kit festa 01")).toBe("KITFESTA01");
  });
});
