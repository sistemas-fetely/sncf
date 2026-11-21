import { strict as assert } from "node:assert";
import { BodySchema } from "./body.ts";
import { autorizarSync } from "./auth.ts";
import { autenticarXpm } from "../_shared/xpm-auth.ts";
import { sincronizarRecebimentos, type Recebimento } from "./sync.ts";

const agora = new Date("2026-11-21T21:32:00Z");
const item = (id: number, data = "2026-11-20T12:00:00") => ({ id, data });
const contagem = async (items: Recebimento[]) => ({ recebimentos: items.length, itens: items.length * 2 });

Deno.test("body opcional usa 60 dias e recusa dias/ids inválidos", () => {
  assert.deepEqual(BodySchema.parse({}), { dias: 60 });
  for (const body of [{ dias: 0 }, { dias: -1 }, { dias: 1.5 }, { dias: "120" }, { ids: [0] }, { ids: ["4854"] }]) {
    assert.equal(BodySchema.safeParse(body).success, false);
  }
});

Deno.test("pagina com 50, SkipCount e id desc; grava a página inteira até o corte de 120 dias", async () => {
  const paths: string[] = [];
  const batches: Recebimento[][] = [];
  const resultado = await sincronizarRecebimentos({ dias: 120 }, {
    agora,
    get: async (path) => {
      paths.push(path);
      return { items: paths.length === 1
        ? Array.from({ length: 50 }, (_, i) => item(i + 100))
        : [item(4854, "2026-08-04T15:39:02.91982"), item(5051, "2026-07-01T12:00:00")], totalCount: 300 };
    },
    upsert: async (items) => { batches.push(items); return contagem(items); },
  });
  assert.deepEqual(paths, [
    "/api/services/app/Recebimento/GetAll?MaxResultCount=50&SkipCount=0&Sorting=id%20desc",
    "/api/services/app/Recebimento/GetAll?MaxResultCount=50&SkipCount=50&Sorting=id%20desc",
  ]);
  assert.equal(batches[1].length, 2);
  assert.deepEqual(resultado, { ok: true, paginas: 2, recebimentos: 52, itens: 104, mais_antigo: "2026-07-01T12:00:00", erros: [] });
});

Deno.test("corte é estritamente mais antigo; data sem fuso é São Paulo", async () => {
  let chamadas = 0;
  const resultado = await sincronizarRecebimentos({ dias: 60 }, {
    agora,
    get: async () => ({ items: ++chamadas === 1
      ? Array.from({ length: 50 }, (_, i) => item(i, "2026-09-22T18:32:00")) : [] }),
    upsert: contagem,
  });
  assert.equal(resultado.ok, true);
  assert.equal(chamadas, 2);
});

Deno.test("lista vazia encerra sem upsert", async () => {
  const resultado = await sincronizarRecebimentos({ dias: 60 }, {
    agora, get: async () => ({ items: [] }), upsert: async () => { throw new Error("não deve gravar"); },
  });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.paginas, 1);
  assert.equal(resultado.recebimentos, 0);
});

Deno.test("40 páginas é limite rígido e sinaliza leitura incompleta", async () => {
  let chamadas = 0;
  const resultado = await sincronizarRecebimentos({ dias: 120 }, {
    agora,
    get: async () => { chamadas++; return { items: Array.from({ length: 50 }, (_, i) => item(i)) }; },
    upsert: contagem,
  });
  assert.equal(chamadas, 40);
  assert.equal(resultado.paginas, 40);
  assert.equal(resultado.recebimentos, 2000);
  assert.equal(resultado.ok, false);
  assert.match(resultado.erros[0], /40 páginas/);
});

Deno.test("ids 4854 e 5051 usam Get e upsert individual, sem aplicar corte de dias", async () => {
  const paths: string[] = [];
  const batches: Recebimento[][] = [];
  const resultado = await sincronizarRecebimentos({ dias: 60, ids: [4854, 5051] }, {
    agora,
    get: async (path) => { paths.push(path); return item(Number(path.split("=")[1]), "2025-01-01T12:00:00"); },
    upsert: async (items) => { batches.push(items); return contagem(items); },
  });
  assert.deepEqual(paths, ["/api/services/app/Recebimento/Get?Id=4854", "/api/services/app/Recebimento/Get?Id=5051"]);
  assert.deepEqual(batches.map((batch) => batch.length), [1, 1]);
  assert.equal(resultado.recebimentos, 2);
  assert.equal(resultado.itens, 4);
  assert.equal(resultado.ok, true);
});

Deno.test("erro HTTP XPM interrompe, preserva mensagem e contadores já gravados", async () => {
  let calls = 0;
  const resultado = await sincronizarRecebimentos({ dias: 60 }, {
    agora,
    get: async () => {
      if (++calls === 2) throw new Error("XPM HTTP 503: serviço indisponível");
      return { items: Array.from({ length: 50 }, (_, i) => item(i)) };
    },
    upsert: contagem,
  });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.recebimentos, 50);
  assert.deepEqual(resultado.erros, ["XPM HTTP 503: serviço indisponível"]);
});

Deno.test("erro RPC não é engolido e não conta recebimentos não gravados", async () => {
  const resultado = await sincronizarRecebimentos({ dias: 60 }, {
    agora, get: async () => ({ items: [item(4854)] }),
    upsert: async () => { throw new Error("fn_xpm_recebimento_upsert: falha de gravação"); },
  });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.recebimentos, 0);
  assert.deepEqual(resultado.erros, ["fn_xpm_recebimento_upsert: falha de gravação"]);
});

Deno.test("resposta inválida não vira lista vazia de sucesso", async () => {
  const resultado = await sincronizarRecebimentos({ dias: 60 }, { agora, get: async () => ({}), upsert: contagem });
  assert.equal(resultado.ok, false);
  assert.match(resultado.erros[0], /result.items/);
});

const authClient = (role = true) => ({
  rpc: async (name: string) => ({ data: name === "get_vault_secret" ? "cron-ficticio" : role, error: null }),
  auth: { getClaims: async () => ({ data: { claims: { sub: "usuario-ficticio" } }, error: null }) },
});

Deno.test("cron válido no Vault autoriza; cron errado não usa fallback de usuário", async () => {
  await autorizarSync(new Request("https://example.test", { headers: { "x-cron-secret": "cron-ficticio" } }), authClient());
  await assert.rejects(() => autorizarSync(new Request("https://example.test", {
    headers: { "x-cron-secret": "errado", Authorization: "Bearer teste" },
  }), authClient()), /x-cron-secret inválido/);
});

Deno.test("sem cron exige sessão válida e super_admin", async () => {
  await assert.rejects(() => autorizarSync(new Request("https://example.test"), authClient()), /sem sessão/);
  await assert.rejects(() => autorizarSync(new Request("https://example.test", {
    headers: { Authorization: "Bearer teste" },
  }), authClient(false)), /super_admin/);
  await autorizarSync(new Request("https://example.test", { headers: { Authorization: "Bearer teste" } }), authClient());
});

Deno.test("helper compartilhado lê PAT do Vault e envia tenantName em AuthenticatePAT", async () => {
  let vaultName = "";
  let chamadas = 0;
  const auth = await autenticarXpm({ rpc: async (_name, args) => {
    vaultName = args.p_name;
    return { data: "pat-ficticio", error: null };
  } }, { base_url: "https://api.zenlog.com.br", tenant_name: "tenant-ficticio", pat_vault_key: "zenlog_pat_prd" }, async (url, init) => {
    chamadas++;
    assert.equal(String(url), "https://api.zenlog.com.br/api/TokenAuth/AuthenticatePAT");
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), { personalAccessToken: "pat-ficticio", tenantName: "tenant-ficticio" });
    return new Response(JSON.stringify({ result: { accessToken: "token-ficticio" } }));
  });
  assert.equal(vaultName, "zenlog_pat_prd");
  assert.equal(chamadas, 1);
  assert.equal(auth.redigir("pat-ficticio token-ficticio"), "[segredo omitido] [segredo omitido]");
});