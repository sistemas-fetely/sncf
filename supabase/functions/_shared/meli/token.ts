// Mercado Livre — token OAuth (F0 MELI-DIRETO). Único lugar que lê/renova o token.
// refresh_token é de USO ÚNICO: a renovação é reservada por conta (fn_meli_reservar_refresh)
// e o novo par é gravado no Vault (fn_meli_gravar_tokens) antes de qualquer outra chamada.
// Nunca logar token, code ou secret.
// deno-lint-ignore-file no-explicit-any
export const MELI_API = "https://api.mercadolibre.com";
export const MELI_TOKEN_URL = `${MELI_API}/oauth/token`;
export const MARGEM_REFRESH_MS = 60 * 60_000;

export type ContaMeli = {
  codigo: string; segredo_client_id: string; segredo_client_secret: string;
  segredo_access_token: string; segredo_refresh_token: string;
  token_expira_em: string | null; ultimo_refresh_em: string | null;
};

export interface Deps { fetch: typeof fetch; agora: () => number; esperar: (ms: number) => Promise<void> }
const padrao: Deps = { fetch: (...a) => fetch(...a), agora: () => Date.now(), esperar: (ms) => new Promise((r) => setTimeout(r, ms)) };

export const precisaRenovar = (expiraEm: string | null, agora: number) =>
  !expiraEm || Date.parse(expiraEm) - agora < MARGEM_REFRESH_MS;

async function lerConta(db: any, conta: string): Promise<ContaMeli> {
  const { data, error } = await db.from("meli_conta")
    .select("codigo,segredo_client_id,segredo_client_secret,segredo_access_token,segredo_refresh_token,token_expira_em,ultimo_refresh_em")
    .eq("codigo", conta).maybeSingle();
  if (error) throw new Error(`Falha ao ler a conta Mercado Livre: ${error.message}`);
  if (!data) throw new Error(`Conta Mercado Livre ${conta} não cadastrada`);
  return data;
}

export async function segredo(db: any, nome: string): Promise<string> {
  const { data, error } = await db.rpc("get_vault_secret", { p_name: nome });
  if (error) throw new Error(`Falha ao ler o cofre (${nome}): ${error.message}`);
  if (!data) throw new Error(`Credencial ${nome} não cadastrada`);
  return String(data);
}

/** Troca no endpoint de token (authorization_code ou refresh_token). Mensagem de erro sem dado sensível. */
export async function trocarToken(f: typeof fetch, corpo: Record<string, string>) {
  const r = await f(MELI_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(corpo).toString(),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j?.access_token || !j?.refresh_token) {
    const motivo = [j?.error, j?.message].filter(Boolean).join(" — ").slice(0, 200) || "resposta inválida";
    throw new Error(`Mercado Livre recusou o token (HTTP ${r.status}): ${motivo}`);
  }
  return { access: String(j.access_token), refresh: String(j.refresh_token), expiraEmSeg: Number(j.expires_in ?? 21600), userId: j.user_id ? Number(j.user_id) : null };
}

async function registrarErro(db: any, conta: string, erro: string) {
  await db.rpc("fn_meli_registrar_erro_token", { p_conta: conta, p_erro: erro });
}

/** Devolve access token válido; renova se faltar menos de 60 min. Fail-loud. */
export async function meliAccessToken(db: any, conta: string, opts: { forcar?: boolean; deps?: Partial<Deps> } = {}): Promise<string> {
  const d = { ...padrao, ...opts.deps };
  let c = await lerConta(db, conta);
  if (!opts.forcar && !precisaRenovar(c.token_expira_em, d.agora())) return segredo(db, c.segredo_access_token);
  const antes = c.ultimo_refresh_em;

  const { data: reservou, error: re } = await db.rpc("fn_meli_reservar_refresh", { p_conta: conta, p_segundos: 90 });
  if (re) throw new Error(`Falha ao reservar a renovação: ${re.message}`);
  if (!reservou) {
    // Outra execução está renovando: espera ela gravar e usa o token novo.
    for (let i = 0; i < 10; i++) {
      await d.esperar(1000);
      c = await lerConta(db, conta);
      if (c.ultimo_refresh_em !== antes && !precisaRenovar(c.token_expira_em, d.agora())) return segredo(db, c.segredo_access_token);
    }
    throw new Error("Renovação do token Mercado Livre em andamento por outra execução; tente de novo.");
  }
  try {
    // Depois da reserva, reler: outra execução pode ter acabado de renovar.
    c = await lerConta(db, conta);
    if (!opts.forcar && !precisaRenovar(c.token_expira_em, d.agora())) {
      await db.rpc("fn_meli_liberar_refresh", { p_conta: conta });
      return segredo(db, c.segredo_access_token);
    }
    const [clientId, clientSecret, refresh] = await Promise.all([
      segredo(db, c.segredo_client_id), segredo(db, c.segredo_client_secret), segredo(db, c.segredo_refresh_token),
    ]);
    const t = await trocarToken(d.fetch, { grant_type: "refresh_token", client_id: clientId, client_secret: clientSecret, refresh_token: refresh });
    const { error: ge } = await db.rpc("fn_meli_gravar_tokens", {
      p_conta: conta, p_access: t.access, p_refresh: t.refresh,
      p_expira_em: new Date(d.agora() + t.expiraEmSeg * 1000).toISOString(),
      p_seller_id: null, p_nickname: null, p_site_id: null, p_por: null,
    });
    if (ge) throw new Error(`Token renovado mas não gravado no cofre: ${ge.message}`);
    return t.access;
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    await registrarErro(db, conta, m);
    throw new Error(m);
  }
}

/** Chamada autenticada à API ML; 1 nova tentativa em 401 após renovar. */
export async function meliFetch(db: any, conta: string, path: string, init: RequestInit = {}, deps: Partial<Deps> = {}): Promise<Response> {
  const f = deps.fetch ?? padrao.fetch;
  const chama = (tk: string) => {
    const h = new Headers(init.headers); h.set("Authorization", `Bearer ${tk}`); h.set("Accept", "application/json");
    return f(`${MELI_API}${path}`, { ...init, headers: h });
  };
  let r = await chama(await meliAccessToken(db, conta, { deps }));
  if (r.status === 401) r = await chama(await meliAccessToken(db, conta, { forcar: true, deps }));
  return r;
}
