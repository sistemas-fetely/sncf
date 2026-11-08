import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
type Config = { site: string; arquivo: string; drive_id?: string; aba: string };
export async function obterArquivoMicrosoft(sb: SupabaseClient) {
  const c = await sb.from("integracoes_config").select("config").eq("sistema", "microsoft_365").maybeSingle();
  if (c.error) throw c.error;
  const config = c.data?.config as Config | undefined;
  if (!config?.site || !config.arquivo || !config.aba) throw new Error("Microsoft 365 não configurado em TI › Integrações e Credenciais.");
  if (!/^[a-zA-Z0-9.-]+\.sharepoint\.com:\/sites\/[a-zA-Z0-9_/-]+$/.test(config.site)) throw new Error("Site SharePoint inválido.");
  const valores: Record<string, string> = {};
  for (const nome of ["tenant_id", "client_id", "client_secret"]) {
    const { data, error } = await sb.rpc("get_vault_secret", { p_name: `m365_${nome}` });
    if (error || !data) throw new Error(`Microsoft 365: credencial ${nome} ausente no Vault.`);
    valores[nome] = String(data);
  }
  if (!/^[a-zA-Z0-9.-]+$/.test(valores.tenant_id)) throw new Error("Tenant Microsoft inválido.");
  const tokenResp = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(valores.tenant_id)}/oauth2/v2.0/token`, {
    method: "POST", body: new URLSearchParams({ client_id: valores.client_id, client_secret: valores.client_secret, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }),
  });
  if (!tokenResp.ok) {
    const error = await tokenResp.json().catch(() => ({}));
    // Never log or echo raw OAuth bodies: they can reflect submitted credentials.
    throw new Error(`Microsoft token HTTP ${tokenResp.status}: ${String(error.error ?? "falha_autenticacao")}`);
  }
  const token = await tokenResp.json();
  if (!token.access_token) throw new Error("Microsoft não retornou token de acesso.");
  const headers = { Authorization: `Bearer ${token.access_token}` };
  const graph = async (path: string) => {
    const resp = await fetch(`https://graph.microsoft.com/v1.0${path}`, { headers });
    if (!resp.ok) {
      const error = await resp.json().catch(() => ({}));
      throw new Error(`Graph HTTP ${resp.status}: ${error.error?.code ?? "erro"} — ${error.error?.message ?? "acesso ao arquivo recusado"}`);
    }
    return resp;
  };
  const [hostname, sitePath] = config.site.split(":");
  const site = await (await graph(`/sites/${hostname}:${sitePath}`)).json();
  const drive = config.drive_id ? { id: config.drive_id } : await (await graph(`/sites/${encodeURIComponent(site.id)}/drive`)).json();
  const arquivo = config.arquivo.startsWith("/")
    ? `/drives/${encodeURIComponent(drive.id)}/root:${config.arquivo.split("/").map(encodeURIComponent).join("/")}`
    : `/drives/${encodeURIComponent(drive.id)}/items/${encodeURIComponent(config.arquivo)}`;
  const item = await (await graph(arquivo)).json();
  if (!String(item.name).toLowerCase().endsWith(".xlsx")) throw new Error("O arquivo Microsoft não é .xlsx.");
  if (Number(item.size) > 30 * 1024 * 1024) throw new Error("Planilha excede 30 MB.");
  const bytes = new Uint8Array(await (await graph(`/drives/${encodeURIComponent(drive.id)}/items/${encodeURIComponent(item.id)}/content`)).arrayBuffer());
  if (bytes.length > 30 * 1024 * 1024) throw new Error("Planilha excede 30 MB.");
  return { bytes, etag: item.eTag ?? null, aba: config.aba, nome: item.name, origemChave: `${config.site}|${drive.id}|${item.id}|${config.aba}` };
}