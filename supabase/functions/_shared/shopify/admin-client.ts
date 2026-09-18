// Cliente Shopify Admin (GraphQL) compartilhado.
//
// Extraido do padrao ja provado em `shopify-pagamento-sync`, `shopify-catalogo-pull`
// e `sincronizar-estoque-shopify` — MESMA versao de API, MESMO fluxo de credencial.
// Nada de `Deno.env.get` para credencial externa: client_id/secret/dominio vivem no
// vault e sao lidos via RPC `get_vault_secret` (doutrina CREDENCIAIS).
//
// Por que token por chamada e nao cacheado: o app e um custom app com
// `client_credentials`; o token vale horas e a troca custa uma chamada. Cachear
// exigiria estado (tabela/DDL) que esta frente nao tem permissao de criar.

export const SHOPIFY_API_VERSION = "2026-04";

// Fallback historico: a conta ja teve dois dominios. So e usado quando
// SHOPIFY_STORE_DOMAIN nao esta no vault — mesma lista das edges existentes.
const CANDIDATE_DOMAINS = ["mmiavm-ui.myshopify.com", "fetely-3.myshopify.com"];

// deno-lint-ignore no-explicit-any -- cliente supabase-js sem tipos gerados nas edges
type Supa = any;

export type GqlResposta<T = unknown> = {
  status: number;
  // deno-lint-ignore no-explicit-any -- corpo bruto do GraphQL (data + errors)
  body: any;
  data: T | null;
  // deno-lint-ignore no-explicit-any -- lista de erros do GraphQL, formato do Shopify
  errors: any[] | null;
};

export type ShopifyAdmin = {
  domain: string;
  gql: <T = unknown>(query: string, variables?: unknown) => Promise<GqlResposta<T>>;
};

export async function getSecret(supabase: Supa, name: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_vault_secret", { p_name: name });
  if (error || !data) return null;
  const v = String(data).trim();
  return v === "" ? null : v;
}

async function exchangeToken(
  domain: string,
  clientId: string,
  clientSecret: string,
): Promise<string | null> {
  try {
    const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve dominio + token e devolve um cliente GraphQL.
 *
 * FAIL-LOUD: credencial ausente ou dominio que nao autentica vira `throw`, nunca
 * um cliente mudo que devolve vazio (silencio aqui viraria "pedido sem CPF" ou
 * "fulfillment nao criado" sem ninguem saber por que).
 */
export async function makeShopifyAdmin(supabase: Supa): Promise<ShopifyAdmin> {
  const clientId = await getSecret(supabase, "SHOPIFY_CLIENT_ID");
  const clientSecret = await getSecret(supabase, "SHOPIFY_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("Credenciais Shopify ausentes no vault (SHOPIFY_CLIENT_ID/SECRET)");
  }

  const storedDomain = await getSecret(supabase, "SHOPIFY_STORE_DOMAIN");
  const domainsToTry = storedDomain ? [storedDomain] : CANDIDATE_DOMAINS;

  let domain: string | null = null;
  let token: string | null = null;
  for (const d of domainsToTry) {
    const t = await exchangeToken(d, clientId, clientSecret);
    if (t) {
      domain = d;
      token = t;
      break;
    }
  }
  if (!domain || !token) {
    throw new Error(`Nenhum dominio Shopify autenticou (tentados: ${domainsToTry.join(", ")})`);
  }

  const dominioOk = domain;
  const tokenOk = token;

  async function gql<T = unknown>(query: string, variables?: unknown): Promise<GqlResposta<T>> {
    const res = await fetch(
      `https://${dominioOk}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": tokenOk },
        body: JSON.stringify({ query, variables: variables ?? {} }),
      },
    );
    const texto = await res.text();
    // deno-lint-ignore no-explicit-any -- resposta bruta antes de qualquer validacao
    let body: any = null;
    try {
      body = JSON.parse(texto);
    } catch {
      body = { parseError: texto.slice(0, 500) };
    }
    return {
      status: res.status,
      body,
      data: (body?.data ?? null) as T | null,
      errors: Array.isArray(body?.errors) ? body.errors : null,
    };
  }

  return { domain: dominioOk, gql };
}

/** GID do Shopify a partir do id numerico (13 digitos no caso de Order). */
export function gidPedido(shopifyId: string | number): string {
  return `gid://shopify/Order/${String(shopifyId).trim()}`;
}

/** Numero cru a partir de um GID (`gid://shopify/Order/123` -> `123`). */
export function idDoGid(gid: string | null | undefined): string | null {
  if (!gid) return null;
  const m = String(gid).match(/(\d+)\s*$/);
  return m ? m[1] : null;
}
