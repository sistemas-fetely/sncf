import { expect, test } from "bun:test";

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { code?: string; message: string } | null };
const mappings = [
  { modo: "pac", modal_codigo: "CORREIOS", centro_tipo_exigido: null },
  { modo: "balcao", modal_codigo: "BALCAO", centro_tipo_exigido: "evento" },
  { modo: "frete_fetely", modal_codigo: "FRETE_FETELY", centro_tipo_exigido: null },
  { modo: "sedex", modal_codigo: "CORREIOS", centro_tipo_exigido: null },
  { modo: "retirada", modal_codigo: "RETIRADA", centro_tipo_exigido: null },
];
const modals = [
  { codigo: "CORREIOS", sem_despacho: false, ativo: true },
  { codigo: "FRETE_FETELY", sem_despacho: false, ativo: true },
  { codigo: "RETIRADA", sem_despacho: true, ativo: true },
  { codigo: "BALCAO", sem_despacho: true, ativo: true },
];

export async function handlerFor(options: {
  tables?: Record<string, Row[]>;
  tableError?: string;
  rpc?: (name: string, args: Row) => Promise<Result>;
  internal?: (url: string, init: RequestInit) => Promise<Response>;
} = {}) {
  const tables = options.tables ?? {
    vd_modo_modal: mappings,
    b2c_modal_entrega: modals,
    centro_distribuicao: [
      { codigo: "SITE-SP", tipo: "armazem", cep: "01139000" },
      { codigo: "FET-SP-SR", tipo: "showroom", cep: "01139000" },
      { codigo: "EVENTO-SP", tipo: "evento", cep: "01139000" },
    ],
  };
  const calls: { name: string; args: Row }[] = [];
  const quotes: Row[] = [];
  const sb = {
    from(name: string) {
      if (!(name in tables)) throw new Error(`Unexpected table ${name}`);
      let rows = tables[name];
      const result = (): Result => ({ data: rows, error: options.tableError === name ? { message: "Leitura recusada" } : null });
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return query; },
        in: (key: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[key])); return query; },
        single: async () => ({ ...result(), data: rows[0] ?? null }),
        maybeSingle: async () => ({ ...result(), data: rows[0] ?? null }),
        then: (resolve: (value: Result) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return query;
    },
    async rpc(name: string, args: Row): Promise<Result> {
      if (name === "get_vault_secret") return { data: "test-only", error: null };
      calls.push({ name, args });
      if (options.rpc) return options.rpc(name, args);
      return { data: { valor_itens: 15, frete_cobrado: 0, valor_total: 15 }, error: null };
    },
  };
  let handler: (req: Request) => Promise<Response> = async () => new Response(null, { status: 503 });
  const source = await Bun.file(new URL("./index.ts", import.meta.url)).text();
  const js = new Bun.Transpiler({ loader: "ts" }).transformSync(source.replace(/^import .*;\r?\n/gm, ""));
  new Function("createClient", "Deno", "fetch", js)(
    () => sb,
    { env: { get: () => "test-only" }, serve: (fn: typeof handler) => { handler = fn; } },
    async (_url: string, init: RequestInit) => {
      quotes.push(JSON.parse(String(init.body)));
      if (options.internal) return options.internal(_url, init);
      return Response.json({ ok: false, erro: "Cotação simulada: nenhuma gravação" });
    },
  );
  const invoke = (body: Row) => handler(new Request("http://localhost/recebe-pedido", {
    method: "POST", headers: { Authorization: "Bearer test-only", "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  return { invoke, calls, quotes };
}

for (const centro of ["SITE-SP", "FET-SP-SR"]) {
  for (const cep of ["01139000", ""]) {
    test(`${centro} ${cep ? "com" : "sem"} CEP preserva os modos atuais e passa o CD`, async () => {
      const { invoke, calls, quotes } = await handlerFor();
      const response = await invoke({ tipo: "balcao_calcular", centro_codigo: centro, endereco: { cep }, itens: [{ sku: "CL-EH-SAC-15-HAL", quantidade: 1 }] });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.opcoes.map((o: { modo: string }) => o.modo)).toEqual(cep ? ["retirada", "sedex", "pac", "frete_fetely"] : ["retirada"]);
      expect(calls.every(c => c.name === "fn_vd_calcular" && (c.args.p_entrega as Row).centro_codigo === centro)).toBe(true);
      expect(quotes.length).toBe(cep ? 1 : 0);
    });
  }
}

test("EVENTO-SP oferece só balcao com ou sem CEP e nunca cota Correios", async () => {
  for (const cep of ["01139000", ""]) {
    const { invoke, calls, quotes } = await handlerFor();
    const data = await (await invoke({ tipo: "balcao_calcular", centro_codigo: "EVENTO-SP", endereco: { cep }, itens: [{ sku: "CL-EH-SAC-15-HAL", quantidade: 1 }] })).json();
    expect(data.opcoes.map((o: { modo: string }) => o.modo)).toEqual(["balcao"]);
    expect(calls).toHaveLength(1);
    expect((calls[0].args.p_entrega as Row).centro_codigo).toBe("EVENTO-SP");
    expect(quotes).toHaveLength(0);
  }
});

test("CEP inválido não libera modos com despacho; CD omitido usa SITE-SP", async () => {
  const { invoke, calls, quotes } = await handlerFor();
  const data = await (await invoke({ tipo: "balcao_calcular", endereco: { cep: "1234567" }, itens: [{ sku: "CL-EH-SAC-15-HAL", quantidade: 1 }] })).json();
  expect(data.opcoes.map((o: { modo: string }) => o.modo)).toEqual(["retirada"]);
  expect((calls[0].args.p_entrega as Row).centro_codigo).toBe("SITE-SP");
  expect(quotes).toHaveLength(0);
});

test("modal inativo não entra; modos novos seguem a ordem legada e depois alfabética", async () => {
  const { invoke } = await handlerFor({ tables: {
    vd_modo_modal: [...mappings, ...["zeta", "alfa", "inativo"].map(modo => ({ modo, modal_codigo: modo, centro_tipo_exigido: null }))],
    b2c_modal_entrega: [...modals, ...["zeta", "alfa", "inativo"].map(codigo => ({ codigo, sem_despacho: true, ativo: codigo !== "inativo" }))],
    centro_distribuicao: [{ codigo: "SITE-SP", tipo: "armazem", cep: "01139000" }],
  } });
  const data = await (await invoke({ tipo: "balcao_calcular", endereco: { cep: "01139-000" }, itens: [{ sku: "CL-EH-SAC-15-HAL", quantidade: 1 }] })).json();
  expect(data.opcoes.map((o: { modo: string }) => o.modo)).toEqual(["retirada", "sedex", "pac", "frete_fetely", "alfa", "zeta"]);
});

test("erro de leitura é devolvido sem calcular", async () => {
  const { invoke, calls } = await handlerFor({ tableError: "vd_modo_modal" });
  const response = await invoke({ tipo: "balcao_calcular" });
  expect(response.status).toBe(500);
  expect((await response.json()).error).toBe("Leitura recusada");
  expect(calls).toHaveLength(0);
});

test("declaração valida ambos os UUIDs e apara NSU ou passa null", async () => {
  const { invoke, calls } = await handlerFor();
  const ids = { fop_profile_id: "11111111-1111-4111-8111-111111111111", pedido_id: "22222222-2222-4222-8222-222222222222" };
  for (const field of ["fop_profile_id", "pedido_id"]) {
    expect((await invoke({ tipo: "balcao_declarar_pagamento", ...ids, [field]: "inválido" })).status).toBe(400);
  }
  expect(calls).toHaveLength(0);
  for (const nsu of ["  123  ", "  ", null]) {
    expect((await invoke({ tipo: "balcao_declarar_pagamento", ...ids, nsu })).status).toBe(200);
  }
  expect(calls.map(c => c.args.p_nsu)).toEqual(["123", null, null]);
  expect(calls.every(c => c.name === "fn_balcao_declarar_pagamento" && c.args.p_pedido_id === ids.pedido_id && c.args.p_fop_profile_id === ids.fop_profile_id)).toBe(true);
});

test("declaração preserva retorno e erro real da RPC", async () => {
  for (const error of [null, { code: "P0001", message: "Pagamento não permitido" }]) {
    const { invoke } = await handlerFor({ rpc: async () => ({ data: { declarado: true }, error }) });
    const response = await invoke({ tipo: "balcao_declarar_pagamento", fop_profile_id: "11111111-1111-4111-8111-111111111111", pedido_id: "22222222-2222-4222-8222-222222222222" });
    expect(response.status).toBe(error ? 400 : 200);
    expect(await response.json()).toEqual(error ? { ok: false, error: error.message } : { ok: true, declarado: true });
  }
});

const ids = { fop_profile_id: "11111111-1111-4111-8111-111111111111", pedido_id: "22222222-2222-4222-8222-222222222222" };
const safraResponse = { ok: true, url: "https://example.test/pix", expira_em: "2026-11-14T17:00:00Z", pagamento_link_id: "link-test" };
const internal = async (url: string, init: RequestInit) => {
  expect(url.endsWith("/functions/v1/safrapay-link")).toBe(true);
  expect((init.headers as Record<string, string>)["x-chamador"]).toBe("recebe-pedido-balcao");
  return Response.json(safraResponse);
};

test("criação pix_safra devolve URL, validade, meio pix e id do link", async () => {
  const { invoke, calls, quotes } = await handlerFor({ internal, rpc: async () => ({ data: { pedido_id: ids.pedido_id, pagamento: "pix_safra" }, error: null }) });
  const data = await (await invoke({ tipo: "balcao_criar", ...ids, pagamento: "pix_safra" })).json();
  expect(calls[0].args.p_pagamento).toBe("pix_safra");
  expect(data).toMatchObject({ url: safraResponse.url, link_pagamento: safraResponse.url, expira_em: safraResponse.expira_em, meio: "pix", pagamento_link_id: "link-test" });
  expect(quotes[0]).toEqual({ pedido_id: ids.pedido_id, forcar_novo: false });
});

test("criação PIX local não chama Safra; cartão continua chamando", async () => {
  for (const pagamento of ["pix", "cartao"]) {
    const { invoke, quotes } = await handlerFor({ internal, rpc: async () => ({ data: { pedido_id: ids.pedido_id, pagamento, link_pagamento: "qr-local" }, error: null }) });
    const data = await (await invoke({ tipo: "balcao_criar", ...ids, pagamento })).json();
    expect(quotes.length).toBe(pagamento === "pix" ? 0 : 1);
    expect(data.link_pagamento).toBe(pagamento === "pix" ? "qr-local" : safraResponse.url);
  }
});

test("balcao_link usa a regra e não a forma pix para distinguir QR e Safra", async () => {
  for (const codigo of ["pix", "pix_safra"]) {
    const { invoke, quotes } = await handlerFor({ internal, tables: {
      vendedores: [{ id: "vend", fop_profile_id: ids.fop_profile_id }],
      pedidos: [{ id: ids.pedido_id, origem: "venda_direta", vendedor_id: "vend", forma_solicitada: "pix", regra_pagamento_id: "regra" }],
      regras_pagamento_pedido: [{ id: "regra", codigo }],
      vw_venda_direta_gestao: [{ id: ids.pedido_id, link_pagamento: "qr-local" }],
    } });
    const data = await (await invoke({ tipo: "balcao_link", ...ids })).json();
    expect(data.meio).toBe("pix");
    expect(data.url).toBe(codigo === "pix" ? "qr-local" : safraResponse.url);
    expect(quotes.length).toBe(codigo === "pix" ? 0 : 1);
  }
});

test("edição e troca geram novo PIX Safra por regra ou sinal da RPC", async () => {
  for (const tipo of ["balcao_editar", "balcao_trocar_meio"]) {
    for (const res of [{ pagamento: "pix_safra", meio_trocado: true }, { precisa_novo_link_pix: true }]) {
      const { invoke, quotes } = await handlerFor({ internal, rpc: async () => ({ data: res, error: null }) });
      const data = await (await invoke({ tipo, ...ids, meio: "pix_safra" })).json();
      expect(data).toMatchObject({ url: safraResponse.url, expira_em: safraResponse.expira_em, meio: "pix", pagamento_link_id: "link-test" });
      expect(quotes[0]).toEqual({ pedido_id: ids.pedido_id, forcar_novo: true });
    }
  }
});

test("erro Safra após criação fica explícito sem desfazer pedido", async () => {
  const { invoke } = await handlerFor({ internal: async () => Response.json({ erro: "PIX por link desligado" }, { status: 409 }), rpc: async () => ({ data: { pedido_id: ids.pedido_id, pagamento: "pix_safra" }, error: null }) });
  const data = await (await invoke({ tipo: "balcao_criar", ...ids, pagamento: "pix_safra" })).json();
  expect(data.pedido_id).toBe(ids.pedido_id);
  expect(data.link_erro).toBe("PIX por link desligado");
  expect(data.url).toBeNull();
});

test("declaração pix_safra propaga a recusa da regra persistida sem chamar Safra", async () => {
  const message = "PIX pelo Safra confirma sozinho pelo link — nao precisa declarar.";
  const { invoke, quotes } = await handlerFor({ rpc: async () => ({ data: null, error: { code: "22023", message } }) });
  const response = await invoke({ tipo: "balcao_declarar_pagamento", ...ids, meio: "pix" });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ ok: false, error: message });
  expect(quotes).toHaveLength(0);
});