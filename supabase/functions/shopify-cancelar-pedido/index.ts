import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { makeShopifyAdmin, gidPedido, type ShopifyAdmin } from "../_shared/shopify/admin-client.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const schema = z.object({ pedido_id: z.string().uuid(), motivo: z.string().trim().min(1).max(5000) }).strict();
type Pedido = { id: string; id_externo: string; canal: string; estagio: string; cancelado_em: string | null; nf_numero: string | null; bling_id_destino: string | null };

export function recusaPedido(p: Pedido): string | null {
  if (p.canal !== "B2C") return "Somente pedidos B2C podem ser cancelados na Shopify por esta ação.";
  if (p.cancelado_em !== null) return "Pedido já cancelado.";
  if (p.nf_numero !== null) return "Pedido com NF: use a esteira de cancelamento fiscal.";
  if (!p.id_externo?.startsWith("SHP-")) return "Pedido sem número SHP- da Shopify.";
  return null;
}

export async function cancelarShopify(shopify: ShopifyAdmin, id: string | number, motivo: string) {
  const mutation = (legado: boolean) => `mutation CancelarPedido($orderId: ID!, $motivo: String!) {
    orderCancel(orderId: $orderId, reason: OTHER, ${legado ? "refund: true" : "refundMethod: { originalPaymentMethodsRefund: true }"},
      restock: true, notifyCustomer: false, staffNote: $motivo) {
      job { id done } orderCancelUserErrors { field message code }
    }
  }`;
  const variables = { orderId: gidPedido(id), motivo };
  let resp = await shopify.gql(mutation(false), variables);
  // Somente rejeição de schema (nenhuma execução) permite trocar para o argumento legado.
  if (resp.status === 200 && !resp.data && resp.errors?.some((e) =>
    /refundMethod/.test(String(e.message)) && /unknown argument|not accepted|doesn't accept/i.test(String(e.message)))) {
    resp = await shopify.gql(mutation(true), variables);
  }
  const payload = resp.data as { orderCancel?: { job?: { id: string; done: boolean }; orderCancelUserErrors?: unknown[] } } | null;
  const falhas = [...(resp.errors ?? []), ...(payload?.orderCancel?.orderCancelUserErrors ?? [])];
  if (resp.status !== 200 || falhas.length || !payload?.orderCancel?.job?.id) {
    const texto = JSON.stringify(resp.body);
    const permissao = /ACCESS_DENIED|access denied|write_orders|scope|not authorized/i.test(texto ?? "");
    const mensagens = falhas.map((e) => typeof e === "object" && e !== null && "message" in e ? String(e.message) : JSON.stringify(e)).join("; ");
    return { sucesso: false as const, erro: permissao
      ? "App da Shopify sem permissão write_orders — liberar no admin da Shopify"
      : mensagens || `Shopify recusou o cancelamento (HTTP ${resp.status}; sem job confirmado).`, resposta_shopify: resp.body };
  }
  return { sucesso: true as const, job: payload.orderCancel.job };
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ sucesso: false, erro: "Use POST." }, 405);
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ sucesso: false, erro: "Não autorizado" }, 401);
    const url = Deno.env.get("SUPABASE_URL");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !service || !anon) throw new Error("Configuração interna de acesso ausente.");
    const admin = createClient(url, service);
    const user = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    // acao.empurrar_xpm é exclusiva da XPM: aqui exige-se pessoa autenticada, nunca service-role.
    const { data: auth, error: authErro } = await user.auth.getUser();
    if (authErro || !auth?.user) return json({ sucesso: false, erro: "Não autorizado" }, 401);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ sucesso: false, erro: "pedido_id deve ser UUID válido e motivo deve ser texto não vazio (até 5000 caracteres)." }, 400);
    const { pedido_id, motivo } = parsed.data;
    const { data: pedido, error: pedErro } = await admin.from("pedidos")
      .select("id,id_externo,canal,estagio,cancelado_em,nf_numero,bling_id_destino").eq("id", pedido_id).maybeSingle();
    if (pedErro) throw new Error(pedErro.message);
    if (!pedido) return json({ sucesso: false, erro: "Pedido não encontrado." }, 400);
    const recusa = recusaPedido(pedido);
    if (recusa) return json({ sucesso: false, erro: recusa }, 400);
    const { data: origem, error: origemErro } = await admin.from("shopify_pedidos").select("shopify_id")
      .eq("order_name", `#${pedido.id_externo.slice(4)}`).maybeSingle();
    if (origemErro) throw new Error(origemErro.message);
    if (!origem?.shopify_id) return json({ sucesso: false, erro: "Pedido não encontrado no espelho da Shopify." }, 400);
    let resultado;
    try { resultado = await cancelarShopify(await makeShopifyAdmin(admin), origem.shopify_id, motivo); }
    catch (e) { return json({ sucesso: false, erro: e instanceof Error ? e.message : String(e), resposta_shopify: null }, 502); }
    if (!resultado.sucesso) return json(resultado, 502);
    let bling_enfileirado = false;
    let aviso_bling: string | undefined;
    if (pedido.bling_id_destino !== null) {
      try {
        const { data, error } = await user.rpc("fn_bling_situacao_enfileirar", {
          p_pedido_id: pedido_id, p_situacao_nome: "Cancelado", p_motivo: motivo,
        });
        if (error) throw new Error(error.message);
        if (data?.ok === false || data?.sucesso === false) throw new Error(data.erro ?? "Enfileiramento recusado.");
        bling_enfileirado = true;
      } catch (e) {
        aviso_bling = `Shopify cancelada, mas o Bling precisa ser cancelado à mão: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    // A propagação ao SNCF pertence exclusivamente ao webhook Shopify.
    return json({ sucesso: true, pedido: pedido.id_externo, shopify_job: resultado.job, bling_enfileirado,
      ...(aviso_bling ? { aviso_bling } : {}) });
  } catch (e) { return json({ sucesso: false, erro: e instanceof Error ? e.message : String(e) }, 500); }
}

if (import.meta.main) Deno.serve(handler);

// Testes colocados no próprio arquivo para respeitar o escopo de dois arquivos desta frente.
if (Deno.args.includes("--test-cancelamento")) {
  const assert = (ok: boolean) => { if (!ok) throw new Error("Regra de cancelamento não atendida"); };
  const base: Pedido = { id: "x", id_externo: "SHP-1401", canal: "B2C", estagio: "recebido", cancelado_em: null, nf_numero: null, bling_id_destino: null };
  for (const [nome, patch] of Object.entries({ "canal B2B recusado": { canal: "B2B" }, "já cancelado recusado": { cancelado_em: "2026-11-16" }, "com NF recusado": { nf_numero: "141" }, "sem SHP recusado": { id_externo: "PED-1401" } })) {
    Deno.test(nome, () => assert(recusaPedido({ ...base, ...patch }) !== null));
  }
  Deno.test("B2C sem NF permitido", () => assert(recusaPedido(base) === null));
  Deno.test("cancelamento com estorno, estoque e sem notificar", async () => {
    const r = await cancelarShopify({ domain: "test", gql: async (q, v) => {
      assert(q.includes("originalPaymentMethodsRefund: true") && q.includes("restock: true") && q.includes("notifyCustomer: false"));
      assert(JSON.stringify(v).includes("gid://shopify/Order/1401"));
      return { status: 200, body: {}, data: { orderCancel: { job: { id: "job1", done: false }, orderCancelUserErrors: [] } } as never, errors: null };
    } }, 1401, "Solicitação do cliente");
    assert(r.sucesso && r.job.id === "job1");
  });
  for (const [nome, status, body, errors] of [
    ["HTTP não 200", 503, {}, null],
    ["GraphQL scope recusado", 200, { errors: [{ message: "ACCESS_DENIED write_orders" }] }, [{ message: "ACCESS_DENIED write_orders" }]],
    ["userErrors recusado", 200, { data: { orderCancel: { orderCancelUserErrors: [{ message: "Already cancelled" }] } } }, null],
  ] as const) Deno.test(nome, async () => {
    const r = await cancelarShopify({ domain: "test", gql: async () => ({ status, body, data: "data" in body ? body.data as never : null, errors: errors ? [...errors] : null }) }, 1401, "Motivo");
    assert(!r.sucesso);
    if (nome.includes("scope")) assert(!r.sucesso && r.erro === "App da Shopify sem permissão write_orders — liberar no admin da Shopify");
  });
  Deno.test("fallback legado somente por erro de schema", async () => {
    let chamadas = 0;
    const r = await cancelarShopify({ domain: "test", gql: async (q) => {
      chamadas++;
      if (chamadas === 1) return { status: 200, body: {}, data: null, errors: [{ message: "Unknown argument refundMethod" }] };
      assert(q.includes("refund: true"));
      return { status: 200, body: {}, data: { orderCancel: { job: { id: "job2", done: true } } } as never, errors: null };
    } }, 1401, "Motivo");
    assert(r.sucesso && chamadas === 2);
  });
}