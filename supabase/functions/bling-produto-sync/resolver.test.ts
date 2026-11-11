import { expect, test } from "bun:test";
import { resolverProduto } from "./resolver.ts";
test("prioriza cache atual sem alterar o vínculo original", async () => {
  const chamadas: string[] = [];
  const r = await resolverProduto("VNOUM.GL.7.4", 16661151871, "16641076798", async (p) => { chamadas.push(p); return { data: { id: 16661151871, codigo: "VNOUM.GL.7.4" } }; });
  expect(chamadas).toEqual(["/produtos/16661151871"]); expect(r.bling_id).toBe("16661151871"); expect(r.resolucao.id_desatualizado).toBe(true);
});
test("404 procura código exato e lê detalhe fresco", async () => {
  const chamadas: string[] = [];
  const r = await resolverProduto("ABC", null, "1", async (p) => { chamadas.push(p); if (p === "/produtos/1") throw { status: 404 }; return { data: p.includes("?") ? [{ id: 2, codigo: "ABC" }] : { id: 2, codigo: "ABC" } }; });
  expect(chamadas).toEqual(["/produtos/1", "/produtos?codigos[]=ABC", "/produtos/2"]); expect(r.bling_id).toBe("2");
});
test("ausente é sem vínculo, não erro", async () => { const r = await resolverProduto("ABC", null, null, async () => ({ data: [] })); expect(r.bling_id).toBeNull(); expect(r.resolucao.fonte).toBe("sem_vinculo"); });
test("falha 429 não vira sem vínculo", async () => { await expect(resolverProduto("ABC", 1, null, async () => { throw new Error("Bling 429"); })).rejects.toThrow("429"); });
test("código parecido não é vínculo", async () => { expect((await resolverProduto("ABC", null, null, async () => ({ data: [{ id: 2, codigo: "ABCD" }] }))).bling_id).toBeNull(); });
