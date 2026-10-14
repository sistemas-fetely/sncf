// Cliente Bling v3: fetch com retry 429/5xx, refresh proativo de token.

export const BLING_BASE = "https://api.bling.com.br/Api/v3";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Headers de TODA chamada à API do Bling (migração JWT obrigatória, 15/10/2026). */
export function blingHeaders(token: string, extra?: Record<string, string>): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: "application/json", "enable-jwt": "1", ...extra };
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
      "enable-jwt": "1",
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

/** Troca o authorization code do OAuth por tokens e grava em integracoes_config. */
export async function exchangeAuthorizationCode(
  supabase: any,
  cfg: Pick<BlingConfig, "client_id" | "client_secret">,
  code: string,
  redirect_uri: string,
): Promise<any> {
  const encoded = btoa(`${cfg.client_id}:${cfg.client_secret}`);
  const params = new URLSearchParams();
  params.set("grant_type", "authorization_code");
  params.set("code", code);
  params.set("redirect_uri", redirect_uri);
  const res = await fetch(`${BLING_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
      "Authorization": `Basic ${encoded}`,
      "enable-jwt": "1",
    },
    body: params,
  });
  const tokens = await res.json();
  if (tokens.access_token) {
    await supabase.from("integracoes_config").update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
      ativo: true,
      updated_at: new Date().toISOString(),
    }).eq("sistema", "bling");
  }
  return tokens;
}

export type BlingPostOpts = { retry?: boolean };

/** Erro HTTP do Bling com status (mensagem idêntica à anterior). */
export class BlingHttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type BlingClient = {
  get: (endpoint: string) => Promise<any>;
  post: (endpoint: string, body: any, opts?: BlingPostOpts) => Promise<any>;
  put: (endpoint: string, body: any, opts?: BlingPostOpts) => Promise<any>;
  patch: (endpoint: string, body: any, opts?: BlingPostOpts) => Promise<any>;
  currentToken: () => string;
};

export function makeBlingClient(supabase: any, cfg: BlingConfig, initialToken: string): BlingClient {
  let token = initialToken;

  async function get(endpoint: string, attempt = 0): Promise<any> {
    const res = await fetch(`${BLING_BASE}${endpoint}`, {
      method: "GET",
      headers: blingHeaders(token),
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

  // retry:false → nunca repete o POST por 429/5xx (criação de NF não é idempotente).
  // O 401 continua renovando o token uma vez: o Bling recusou sem processar.
  async function post(endpoint: string, body: any, opts?: BlingPostOpts, attempt = 0): Promise<any> {
    const podeRepetir = opts?.retry !== false;
    const res = await fetch(`${BLING_BASE}${endpoint}`, {
      method: "POST",
      headers: blingHeaders(token, { "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });

    if (res.status === 401 && attempt === 0) {
      token = await refreshAccessToken(supabase, { ...cfg, access_token: token });
      return post(endpoint, body, opts, attempt + 1);
    }
    if (podeRepetir && (res.status === 429 || res.status >= 500) && attempt < 3) {
      const wait = 1000 * Math.pow(2, attempt);
      await sleep(wait);
      return post(endpoint, body, opts, attempt + 1);
    }
    if (!res.ok) {
      const txt = await res.text();
      throw new BlingHttpError(`Bling POST ${endpoint} ${res.status}: ${txt.slice(0, 500)}`, res.status);
    }
    return res.json();
  }

  // PUT/PATCH: mesma semântica do POST; corpo vazio (204) devolve null.
  async function enviar(
    metodo: "PUT" | "PATCH",
    endpoint: string,
    body: any,
    opts?: BlingPostOpts,
    attempt = 0,
  ): Promise<any> {
    const podeRepetir = opts?.retry !== false;
    const res = await fetch(`${BLING_BASE}${endpoint}`, {
      method: metodo,
      headers: blingHeaders(token, { "Content-Type": "application/json" }),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401 && attempt === 0) {
      token = await refreshAccessToken(supabase, { ...cfg, access_token: token });
      return enviar(metodo, endpoint, body, opts, attempt + 1);
    }
    if (podeRepetir && (res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(1000 * Math.pow(2, attempt));
      return enviar(metodo, endpoint, body, opts, attempt + 1);
    }
    const txt = await res.text();
    if (!res.ok) {
      throw new BlingHttpError(`Bling ${metodo} ${endpoint} ${res.status}: ${txt.slice(0, 500)}`, res.status);
    }
    if (res.status === 204 || !txt.trim()) return null;
    try {
      return JSON.parse(txt);
    } catch {
      return null;
    }
  }

  return {
    get,
    post,
    put: (e, b, o) => enviar("PUT", e, b, o),
    patch: (e, b, o) => enviar("PATCH", e, b, o),
    currentToken: () => token,
  };
}
