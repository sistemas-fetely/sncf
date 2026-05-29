// Cliente Bling v3: fetch com retry 429/5xx, refresh proativo de token.

export const BLING_BASE = "https://api.bling.com.br/Api/v3";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export type BlingConfig = {
  client_id: string;
  client_secret: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string | null;
};

export async function ensureFreshToken(supabase: any, cfg: BlingConfig): Promise<string> {
  if (!cfg.token_expires_at) return cfg.access_token;
  const expires = new Date(cfg.token_expires_at).getTime();
  // refresh proativo se faltar menos de 5min
  if (expires - Date.now() > 5 * 60 * 1000) return cfg.access_token;
  return refreshAccessToken(supabase, cfg);
}

export async function refreshAccessToken(supabase: any, cfg: BlingConfig): Promise<string> {
  const encoded = btoa(`${cfg.client_id}:${cfg.client_secret}`);
  const params = new URLSearchParams();
  params.set("grant_type", "refresh_token");
  params.set("refresh_token", cfg.refresh_token);
  const res = await fetch(`${BLING_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
      "Authorization": `Basic ${encoded}`,
    },
    body: params,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Falha ao renovar token (${res.status}): ${txt}. Reconecte o Bling.`);
  }
  const tokens = await res.json();
  await supabase.from("integracoes_config").update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("sistema", "bling");
  return tokens.access_token;
}

export type BlingClient = {
  get: (endpoint: string) => Promise<any>;
  post: (endpoint: string, body: any) => Promise<any>;
  currentToken: () => string;
};

export function makeBlingClient(supabase: any, cfg: BlingConfig, initialToken: string): BlingClient {
  let token = initialToken;

  async function get(endpoint: string, attempt = 0): Promise<any> {
    const res = await fetch(`${BLING_BASE}${endpoint}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });

    if (res.status === 401 && attempt === 0) {
      token = await refreshAccessToken(supabase, { ...cfg, access_token: token });
      return get(endpoint, attempt + 1);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      const wait = 1000 * Math.pow(2, attempt);
      await sleep(wait);
      return get(endpoint, attempt + 1);
    }
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Bling ${res.status}: ${txt.slice(0, 300)}`);
    }
    return res.json();
  }

  async function post(endpoint: string, body: any, attempt = 0): Promise<any> {
    const res = await fetch(`${BLING_BASE}${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.status === 401 && attempt === 0) {
      token = await refreshAccessToken(supabase, { ...cfg, access_token: token });
      return post(endpoint, body, attempt + 1);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      const wait = 1000 * Math.pow(2, attempt);
      await sleep(wait);
      return post(endpoint, body, attempt + 1);
    }
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Bling POST ${endpoint} ${res.status}: ${txt.slice(0, 500)}`);
    }
    return res.json();
  }

  return { get, post, currentToken: () => token };
}
