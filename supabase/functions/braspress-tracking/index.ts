import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function fail(msg: string, status: number) {
  console.error("[braspress-tracking] FAIL:", msg);
  return new Response(JSON.stringify({ erro: msg }), { status, headers: jsonHeaders });
}

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: linha, error: errCfg } = await supabase
      .from("integracoes_config")
      .select("config")
      .eq("sistema", "braspress")
      .maybeSingle();

    if (errCfg) return fail(`erro ao ler integracoes_config: ${errCfg.message}`, 500);
    if (!linha?.config) return fail("integracoes_config sem linha para sistema='braspress'", 500);

    const cfg = linha.config as Record<string, unknown>;
    for (const k of ["base_url", "vault_key", "cnpj_tomador"]) {
      if (!cfg[k]) return fail(`config braspress sem a chave obrigatoria '${k}'`, 500);
    }
    const baseUrl = String(cfg.base_url).replace(/\/+$/, "");
    const vaultKey = String(cfg.vault_key);
    const cnpjTomador = digits(cfg.cnpj_tomador);

    const { data: segredo, error: errVault } = await supabase.rpc("get_vault_secret", {
      p_name: vaultKey,
    });
    if (errVault) return fail(`erro ao ler credencial do vault: ${errVault.message}`, 500);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const credencial = typeof segredo === "string" ? segredo : (segredo as any)?.secret ?? "";
    if (!credencial || !String(credencial).trim()) {
      return fail(`credencial do vault '${vaultKey}' vazia ou inexistente`, 500);
    }
    const basic = btoa(String(credencial).trim());

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch (e) {
      console.error("[braspress-tracking] body invalido:", e);
      return fail("corpo da requisicao nao e JSON valido", 400);
    }

    const nf = body.nf !== undefined && body.nf !== null ? String(body.nf).trim() : "";
    const numPedido =
      body.numPedido !== undefined && body.numPedido !== null
        ? String(body.numPedido).trim()
        : "";

    if (!nf && !numPedido) {
      return fail("informe exatamente um entre 'nf' e 'numPedido' — nenhum foi enviado", 400);
    }
    if (nf && numPedido) {
      return fail("informe exatamente um entre 'nf' e 'numPedido' — ambos foram enviados", 400);
    }

    const cnpj = body.cnpj ? digits(body.cnpj) : cnpjTomador;
    if (!cnpj) return fail("cnpj vazio apos normalizacao", 400);

    const url = nf
      ? `${baseUrl}/v3/tracking/byNf/${cnpj}/${encodeURIComponent(nf)}/json`
      : `${baseUrl}/v3/tracking/byNumPedido/${cnpj}/${encodeURIComponent(numPedido)}/json`;

    const t0 = Date.now();
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${basic}`,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[braspress-tracking] falha de rede:", msg);
      return fail(`falha de rede ao chamar a Braspress: ${msg}`, 502);
    }
    const duracao_ms = Date.now() - t0;

    const texto = await resp.text();
    let resposta: unknown;
    try {
      resposta = texto ? JSON.parse(texto) : null;
    } catch {
      resposta = texto;
    }

    return new Response(
      JSON.stringify({
        ok: resp.ok,
        http_status: resp.status,
        duracao_ms,
        url_chamada: url,
        resposta,
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[braspress-tracking] erro nao tratado:", msg);
    return fail(`erro nao tratado: ${msg}`, 500);
  }
});
