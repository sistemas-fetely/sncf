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

// Execute the production validation block without running the queue or sending orders.
const carrierStart = source.indexOf("          let transportadoraBlingVd:");
const carrierEnd = source.indexOf("          // Modal do frete", carrierStart);
const carrierBlock = source.slice(carrierStart, carrierEnd).replace(/: number \| null/g, "");
const auditDeclaration = source.match(/let transportadoraBlingIdVd: number \| null = ([^;]+);/)?.[1];
if (!auditDeclaration) throw new Error("Missing carrier audit declaration");
const runCarrier = new Function("supabase", "viaTransportadora", "ped", "item", "idExterno", `
  return (async () => {
    const errors = [];
    const falharVd = async (message) => { errors.push(message); };
    for (const once of [true]) {
      ${carrierBlock}
      const transportadoraBlingIdVd = ${auditDeclaration};
      return { carrier: transportadoraBlingVd, audit: transportadoraBlingIdVd, errors };
    }
    return { errors };
  })();
`);

function carrierDb(ownId: unknown, agencyId: unknown = 789, mapped = true, failedTable = "") {
  const calls: { table: string; filters: Record<string, unknown> }[] = [];
  return {
    calls,
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { filters[key] = value; return query; },
        maybeSingle() {
          calls.push({ table, filters });
          if (table === failedTable) return { data: null, error: { message: "falha de leitura" } };
          const data = table === "centro_distribuicao" ? { codigo: "XPM-SC" }
            : table === "transportadora_agencia_cd" ? (mapped ? { agencia_id: "agencia" } : null)
            : filters.id === "agencia" ? { bling_id: agencyId }
            : { bling_id: ownId, razao_social: "Correios" };
          return { data, error: null };
        },
      };
      return query;
    },
  };
}

const carrierPed = { transportadora_id: "c60c4038-8f35-4a49-a665-fe6a0aa065d8" };
const carrierItem = { centro_id_resolvido: "cd-sc" };
const missingAgencyMessage = "Pedido VD-0162: transportadora Correios sem bling_id e sem agência ativa para o CD XPM-SC em transportadora_agencia_cd — nada enviado.";

Deno.test("VD carrier with own Bling ID preserves it and records it without agency lookup", async () => {
  const db = carrierDb(456);
  assertEquals(await runCarrier(db, true, carrierPed, carrierItem, "VD-0162"), { carrier: 456, audit: 456, errors: [] });
  assertEquals(db.calls.length, 1);
});
for (const ownId of [null, 0]) {
  Deno.test(`VD carrier ${ownId} resolves active agency for the destination CD and records its ID`, async () => {
    const db = carrierDb(ownId);
    assertEquals(await runCarrier(db, true, carrierPed, carrierItem, "VD-0162"), { carrier: 789, audit: 789, errors: [] });
    assertEquals(db.calls, [
      { table: "parceiros_comerciais", filters: { id: carrierPed.transportadora_id } },
      { table: "centro_distribuicao", filters: { id: "cd-sc" } },
      { table: "transportadora_agencia_cd", filters: { transportadora_id: carrierPed.transportadora_id, ativo: true, centro_codigo: "XPM-SC" } },
      { table: "parceiros_comerciais", filters: { id: "agencia" } },
    ]);
  });
}
Deno.test("VD carrier without active agency fails before sending", async () => {
  assertEquals(await runCarrier(carrierDb(null, 789, false), true, carrierPed, carrierItem, "VD-0162"), { errors: [missingAgencyMessage] });
});
Deno.test("VD carrier agency without Bling ID fails before sending", async () => {
  assertEquals(await runCarrier(carrierDb(null, 0), true, carrierPed, carrierItem, "VD-0162"), { errors: [missingAgencyMessage] });
});
Deno.test("VD carrier agency query errors fail loud", async () => {
  assertEquals(await runCarrier(carrierDb(null, 789, true, "transportadora_agencia_cd"), true, carrierPed, carrierItem, "VD-0162"), { errors: ["ler transportadora_agencia_cd: falha de leitura"] });
});
Deno.test("other VD modes do not enter the carrier lookup", async () => {
  const db = carrierDb(null);
  assertEquals(await runCarrier(db, false, carrierPed, carrierItem, "VD-0162"), { carrier: null, audit: null, errors: [] });
  assertEquals(db.calls, []);
});