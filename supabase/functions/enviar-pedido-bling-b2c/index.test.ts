import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
const start = source.indexOf("          let pesoReal = 0;");
const payload = source.indexOf("          const payloadVd:", start);
const read = source.slice(start, payload).replace(/ as\s*\| \{ fonte\?: string; peso\?: number \| string \| null; volumes\?: number \| string \| null \}\s*\| null/, "");
const fields = source.slice(source.indexOf("                ...(viaTransportadora && pesoReal > 0", payload), source.indexOf("                etiqueta:", source.indexOf("                ...(viaTransportadora && pesoReal > 0", payload)));
const run = new Function("supabase", "viaTransportadora", "ped", "pedidoIdVd", `${read}; return {${fields}};`.replace(/^/, "return (async () => {").replace(/$/, "})()"));

Deno.test("VD carrier reads real weight and total volumes, no per-box array", async () => {
  const calls: unknown[] = [];
  const sb = { rpc(name: string, args: unknown) { calls.push([name, args]); return { data: [{ peso: "12.3456", volumes: "3" }], error: null }; } };
  const result = await run(sb, true, { peso_bruto_total: 99 }, "pedido");
  assertEquals(calls, [["fn_pedido_peso_real", { p_pedido_id: "pedido" }]]);
  assertEquals(result, { pesoBruto: 12.346, quantidadeVolumes: 3 });
});
Deno.test("other VD modes neither call weight RPC nor get new fields", async () => {
  const sb = { rpc() { throw new Error("RPC must not run"); } };
  assertEquals(await run(sb, false, { peso_bruto_total: 99 }, "pedido"), {});
});
Deno.test("weight fallback matches B2B when the RPC has no result", async () => {
  const sb = { rpc() { return { data: null, error: null }; } };
  assertEquals(await run(sb, true, { peso_bruto_total: 4.7 }, "pedido"), { pesoBruto: 4.7 });
  assertEquals(await run(sb, true, { peso_bruto_total: 0 }, "pedido"), {});
});