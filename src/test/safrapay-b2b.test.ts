import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

async function executar(edge: string, options: { meio?: string; pix?: boolean; slugs?: string[]; origem?: string } = {}) {
  let handler: (req: Request) => Promise<Response> = async () => new Response();
  const inserts: Record<string, unknown>[] = [];
  const payloads: Record<string, unknown>[] = [];
  const linhas = [
    { id: "pix-3", tipo_pagamento: "pix", numero_parcela: 3, valor: 100, pago_em: null, status: "aberto" },
    { id: "pix-1", tipo_pagamento: "pix", numero_parcela: 1, valor: 50.12, pago_em: null, status: "aberto" },
    ...(!options.pix ? [
      { id: "cartao-2", tipo_pagamento: "cartao", numero_parcela: 2, valor: 20.22, pago_em: null, status: "aberto" },
      { id: "cartao-1", tipo_pagamento: "cartao", numero_parcela: 1, valor: 10.11, pago_em: null, status: "aberto" },
    ] : []),
    { id: "cancelada", tipo_pagamento: "cartao", numero_parcela: 0, valor: 900, pago_em: null, status: "cancelada" },
  ];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "user" } } }) },
    rpc: async (name: string, args: Record<string, string>) => ({ data: name === "tem_permissao" ? (options.slugs ?? ["acao.cobranca_gerar_link"]).includes(args.p_slug) : "mock-token" }),
    from: (table: string) => {
      let inserting = false;
      const result = () => ({ data: inserting ? { id: "link" } : table === "pedidos" ? {
        origem: options.origem ?? "b2b", estagio: "aguardando_pagamento", forma_solicitada: "boleto", valor_liquido: 999, parceiro_id: "pj",
      } : table === "safrapay_config" ? { ativo: true, pix_ativo: true, pix_no_link: true, ambiente: "hml", url_api_hml: "https://mock", url_portal_hml: "https://mock", segredo_token_hml: "secret", max_parcelas: 12 } : table === "provisao_recebimento" ? linhas : table === "parceiros_comerciais" ? {
        razao_social: "Cliente PJ", cnpj: "12345678000195", cpf: null, email: "pj@example.com", telefone: "11999999999",
      } : [] });
      const q: Record<string, unknown> = {};
      for (const method of ["select", "eq", "is", "in", "update"]) q[method] = () => q;
      q.insert = (value: Record<string, unknown>) => { inserts.push(value); inserting = true; return q; };
      q.single = q.maybeSingle = async () => result();
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
      return q;
    },
  };
  const source = readFileSync(`supabase/functions/${edge}/index.ts`, "utf8").replace(/^import .*;$/gm, "");
  runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, {
    createClient: () => client, corsHeaders: {}, Response, console, Deno: { env: { get: () => "mock" }, serve: (fn: typeof handler) => { handler = fn; } },
    fetch: async (url: string, init?: RequestInit) => {
      const payload = init?.body ? JSON.parse(String(init.body)) : null;
      if (payload) payloads.push(payload);
      const data = url.endsWith("/auth") ? { accessToken: "mock" } : url.endsWith("/paymentTypes") ? { supportedPaymentTypes: ["Credit"] } : url.endsWith("/charge/pix") ? { charge: { id: "charge", transactions: [{ qrCode: "mock-pix" }] } } : { id: "link", smartCheckoutUrl: "https://mock/link", paymentSupportedTypes: ["Credit", "Pix"] };
      return new Response(JSON.stringify(data));
    },
  });
  const response = await handler(new Request("http://mock", { method: "POST", headers: { Authorization: "Bearer mock" }, body: JSON.stringify({ pedido_id: "00000000-0000-0000-0000-000000000001", ...(options.meio ? { meio: options.meio } : {}) }) }));
  return { status: response.status, body: await response.json(), inserts, payloads };
}

describe("SafraPay B2B sem chamadas externas", () => {
  it("soma cartão e usa quantidade de linhas e menor parcela, ignorando forma do pedido/config", async () => {
    const r = await executar("safrapay-link", { meio: "cartao" });
    expect(r.status).toBe(200);
    expect(r.inserts[0]).toMatchObject({ valor: 30.33, max_parcelas: 2, provisao_id: "cartao-1" });
    expect(r.payloads[0]).toMatchObject({ amount: 3033, customer: { document: "12345678000195", documentType: 2 } });
  });
  it("recusa meio omitido quando PIX e cartão estão abertos", async () => {
    const r = await executar("safrapay-link");
    expect(r.status).toBe(409);
    expect(r.inserts).toHaveLength(0);
  });
  it("infere PIX único e soma linhas no link", async () => {
    const r = await executar("safrapay-link", { pix: true });
    expect(r.inserts[0]).toMatchObject({ valor: 150.12, max_parcelas: 1, provisao_id: "pix-1" });
  });
  it("PIX direto cobra só a próxima parcela e mantém seu vínculo", async () => {
    const r = await executar("safrapay-pix");
    expect(r.status).toBe(200);
    expect(r.inserts[0]).toMatchObject({ valor: 50.12, provisao_id: "pix-1", meio: "pix" });
  });
  it.each(["safrapay-link", "safrapay-pix"])("%s não libera B2B só com acesso VD", async (edge) => {
    const r = await executar(edge, { slugs: ["tela.venda_direta_gestao"], meio: "cartao" });
    expect(r.status).toBe(403);
    expect(r.inserts).toHaveLength(0);
  });
  it("usuário com as duas permissões pode gerar B2B", async () => {
    const r = await executar("safrapay-link", { slugs: ["tela.venda_direta_gestao", "acao.cobranca_gerar_link"], meio: "cartao" });
    expect(r.status).toBe(200);
  });
});