import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Execute the actual successful queue branch with a fake client: no network or writes.
const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
const branch = source.slice(source.indexOf("          if (item.nf_id) {"), source.indexOf("        } else {", source.indexOf("          if (item.nf_id) {")));
const run = new Function("sb", "item", "resultado", `return (async () => {${branch}})()`);

for (const nfId of [null, "nf-123"]) {
  Deno.test(`queue succeeds ${nfId ? "with NF link" : "without NF link"}`, async () => {
    const updates: { table: string; values: Record<string, unknown> }[] = [];
    const tables: string[] = [];
    const sb = { from(table: string) {
      tables.push(table);
      const q = {
        select() { return q; },
        update(values: Record<string, unknown>) { updates.push({ table, values }); return q; },
        eq() { return q; },
        is() { return Promise.resolve({ error: null }); },
        maybeSingle() { return Promise.resolve({ data: { id_externo: "VD-0096" } }); },
      };
      return q;
    } };
    const resultado = { sucesso: 0 };
    await run(sb, { id: "fila", nf_id: nfId, pedido_id: "pedido" }, resultado);
    assertEquals(tables.includes("nfs_emitidas"), nfId !== null);
    assertEquals(updates.find((u) => u.table === "xpm_pedido_fila_b2c")?.values.status, "concluido");
    assertEquals(resultado.sucesso, 1);
  });
}