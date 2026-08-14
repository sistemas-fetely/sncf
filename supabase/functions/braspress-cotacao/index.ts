import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function fail(msg: string, status: number) {
  console.error("[braspress-cotacao] FAIL:", msg);
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
    for (const k of ["base_url", "vault_key", "cnpj_tomador", "cep_origem_padrao", "endpoint_cotacao"]) {
      if (!cfg[k]) return fail(`config braspress sem a chave obrigatoria '${k}'`, 500);
    }
    const baseUrl = String(cfg.base_url);
    const vaultKey = String(cfg.vault_key);
    const cnpjTomador = digits(cfg.cnpj_tomador);
    const cepOrigemPadrao = digits(cfg.cep_origem_padrao);
    const endpointCotacao = String(cfg.endpoint_cotacao);

    const { data: segredo, error: errVault } = await supabase.rpc("get_vault_secret", {
      p_name: vaultKey,
    });
    if (errVault) return fail(`erro ao ler credencial do vault: ${errVault.message}`, 500);
    const credencial = typeof segredo === "string" ? segredo : (segredo as any)?.secret ?? "";
    if (!credencial || !String(credencial).trim()) {
      return fail(`credencial do vault '${vaultKey}' vazia ou inexistente`, 500);
    }
    const basic = btoa(String(credencial).trim());

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch (e) {
      console.error("[braspress-cotacao] body invalido:", e);
      return fail("corpo da requisicao nao e JSON valido", 400);
    }

    const cepDestino = digits(body.cepDestino);
    if (!cepDestino) return fail("cepDestino e obrigatorio", 400);

    const peso = Number(body.peso);
    if (!Number.isFinite(peso) || peso <= 0) return fail("peso e obrigatorio (numero > 0)", 400);

    const volumes = Number(body.volumes);
    if (!Number.isInteger(volumes) || volumes <= 0) {
      return fail("volumes e obrigatorio (inteiro > 0)", 400);
    }

    const vlrMercadoria = Number(body.vlrMercadoria);
    if (!Number.isFinite(vlrMercadoria) || vlrMercadoria <= 0) {
      return fail("vlrMercadoria e obrigatorio (numero > 0)", 400);
    }

    const cepOrigem = body.cepOrigem ? digits(body.cepOrigem) : cepOrigemPadrao;
    const modal = body.modal ? String(body.modal) : "R";
    const tipoFrete = body.tipoFrete ? String(body.tipoFrete) : "1";

    let cubagem: unknown;
    if (Array.isArray(body.cubagem) && body.cubagem.length > 0) {
      cubagem = body.cubagem;
    } else if (body.cubagemM3 !== undefined && body.cubagemM3 !== null) {
      const m3 = Number(body.cubagemM3);
      if (!Number.isFinite(m3) || m3 <= 0) return fail("cubagemM3 invalido (numero > 0)", 400);
      const aresta = Math.round(Math.cbrt(m3 / volumes) * 1000) / 1000;
      cubagem = [{ comprimento: aresta, largura: aresta, altura: aresta, volumes }];
    } else {
      return fail("cubagem e obrigatoria: informe 'cubagem' (array) ou 'cubagemM3' (total em m3)", 400);
    }

    const payload: Record<string, unknown> = {
      cnpjRemetente: cnpjTomador,
      modal,
      tipoFrete,
      cepOrigem,
      cepDestino,
      vlrMercadoria,
      peso,
      volumes,
      cubagem,
    };
    const cnpjDestinatario = body.cnpjDestinatario ? digits(body.cnpjDestinatario) : "";
    if (cnpjDestinatario) payload.cnpjDestinatario = cnpjDestinatario;

    const url = `${baseUrl}${endpointCotacao}`;
    const t0 = Date.now();
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${basic}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[braspress-cotacao] falha de rede:", msg);
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
        payload_enviado: payload,
        resposta,
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[braspress-cotacao] erro nao tratado:", msg);
    return fail(`erro nao tratado: ${msg}`, 500);
  }
});
