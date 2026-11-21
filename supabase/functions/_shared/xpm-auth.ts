// AuthenticatePAT follows inspecionar-api-xpm; credentials only come from Vault.
export type XpmConfig = Record<string, string>;
type VaultClient = {
  rpc(name: string, args: { p_name: string }): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export async function autenticarXpm(
  sb: VaultClient,
  cfg: XpmConfig,
  fetcher: typeof fetch = fetch,
): Promise<{ token: string; redigir: (message: string) => string }> {
  if (!cfg.pat_vault_key || !cfg.base_url || !cfg.tenant_name) {
    throw new Error("Config XPM incompleta: base_url, tenant_name e pat_vault_key são obrigatórios.");
  }
  const { data: pat, error } = await sb.rpc("get_vault_secret", { p_name: cfg.pat_vault_key });
  if (error) throw new Error(`vault: ${error.message}`);
  if (typeof pat !== "string" || !pat) throw new Error("PAT ausente no vault");
  let token = "";
  const redigir = (message: string) => {
    let safe = message.replaceAll(pat, "[segredo omitido]");
    if (token) safe = safe.replaceAll(token, "[segredo omitido]");
    return safe;
  };
  const base = cfg.base_url.replace(/\/$/, "");
  const endpoint = cfg.auth_endpoint ?? "/api/TokenAuth/AuthenticatePAT";
  const authUrl = new URL(endpoint, `${base}/`);
  if (authUrl.origin !== new URL(base).origin || authUrl.protocol !== "https:") {
    throw new Error("Endpoint de autenticação XPM fora da origem configurada.");
  }
  try {
    const response = await fetcher(authUrl, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ personalAccessToken: pat, tenantName: cfg.tenant_name }),
    });
    const body = await response.json().catch(() => null);
    const accessToken = body?.result?.accessToken;
    if (!response.ok || typeof accessToken !== "string" || !accessToken) {
      throw new Error(`auth falhou: HTTP ${response.status}: ${body?.error?.message ?? "resposta sem accessToken"}`);
    }
    token = accessToken;
    return { token, redigir };
  } catch (error) {
    throw new Error(redigir(error instanceof Error ? error.message : String(error)));
  }
}