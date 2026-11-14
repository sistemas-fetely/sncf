import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { clienteHml, entrada, extrairBarras, FalhaSafra, objeto, payloadHml, redigir, vencimentoHml } from "./helpers.ts";

const cors = { ...corsHeaders, "Access-Control-Allow-Headers": `${corsHeaders["Access-Control-Allow-Headers"] ?? "authorization, apikey, content-type, x-client-info"}, x-cron-secret` };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, erro: "Método não permitido" }, 405);
  let body;
  try { body = entrada(await req.json()); } catch (e) { return json({ ok: false, erro: e instanceof Error ? e.message : "Body inválido" }, 400); }
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ ok: false, erro: "Configuração interna indisponível" }, 500);
  const sb = createClient(url, service);
  const segredos = [service];
  const etapas: { etapa: string; http_status: number | null; resumo: unknown; erro: string | null; erro_codigo?: string }[] = [];
  let numero: string | null = null;
  let barras: string | null = null;
  let linhaLocal: string | null = null;
  let barrasLocal: string | null = null;
  try {
    const cron = req.headers.get("x-cron-secret");
    if (cron) {
      segredos.push(cron);
      const { data, error } = await sb.rpc("get_vault_secret", { p_name: "SYNC_CRON_SECRET" });
      if (error || !data || data !== cron) return json({ ok: false, erro: "x-cron-secret inválido" }, 401);
    } else {
      const auth = req.headers.get("Authorization");
      if (!auth?.startsWith("Bearer ")) return json({ ok: false, erro: "Não autorizado: token ausente" }, 401);
      segredos.push(auth.slice(7).trim());
      const sbUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
      const { data: claims, error: eClaims } = await sbUser.auth.getClaims(auth.slice(7).trim());
      if (eClaims || !claims?.claims) return json({ ok: false, erro: "Sessão inválida" }, 401);
      const { data: slug, error: eSlug } = await sb.from("permissoes_catalogo").select("id").eq("slug", "tela.cobranca").maybeSingle();
      if (eSlug) throw new Error(`Ler catálogo de permissões: ${eSlug.message}`);
      let permitido = false;
      for (const p_slug of slug ? ["tela.cobranca"] : ["tela.venda_direta_gestao", "acao.cobranca_gerar_link"]) {
        const { data, error } = await sbUser.rpc("tem_permissao", { p_slug });
        if (error) throw new Error(`Avaliar permissão: ${error.message}`);
        if (data === true) { permitido = true; break; }
      }
      if (!permitido) return json({ ok: false, erro: "Sem permissão de cobrança" }, 403);
    }
    const chamar = clienteHml({ fetch, segredos,
      iniciar: async (log) => {
        const { data, error } = await sb.from("safra_api_log").insert(log).select("id").single();
        if (error || !data) throw new Error(`Gravar request Safra: ${error?.message ?? "sem id"}`);
        return String(data.id);
      },
      finalizar: async (id, log) => {
        const { error } = await sb.from("safra_api_log").update(log).eq("id", id);
        if (error) throw new Error(`Gravar response Safra: ${error.message}`);
      },
    });
    let cached: string | null = null;
    const token = async () => {
      if (cached) return cached;
      const cred: Record<string, string> = { grant_type: "password" };
      for (const campo of ["client_id", "username", "password"]) {
        const { data, error } = await sb.rpc("get_vault_secret", { p_name: `safra_cob_${campo}_hml` });
        if (error || !data) throw new Error(`Credencial HML indisponível: safra_cob_${campo}_hml`);
        cred[campo] = String(data); segredos.push(String(data));
      }
      const r = await chamar("/gateway/v1/oauth2/token", "POST", cred, undefined, true);
      const c = objeto(r.corpo);
      if (typeof c.access_token !== "string" || !c.access_token) throw new FalhaSafra(502, "TOKEN_AUSENTE", "Safra respondeu sem access_token");
      cached = c.access_token;
      etapas.push({ etapa: "token", http_status: r.http_status, resumo: { autenticado: true }, erro: null });
      return cached;
    };
    if (body.acao === "token") { await token(); return json({ ok: true, etapas }); }

    const { data: registros, error: eParams } = await sb.from("parametros_remessa_safra").select("chave,valor").in("chave", ["agencia_4d", "conta_7d", "nosso_numero_proximo"]);
    if (eParams) throw new Error(`Ler parâmetros Safra: ${eParams.message}`);
    const params = Object.fromEntries((registros ?? []).map((r) => [r.chave, String(r.valor)]));
    numero = body.nosso_numero ?? params.nosso_numero_proximo;
    if (!numero || !/^\d{1,9}$/.test(numero)) throw new Error("nosso_numero inválido ou ausente");
    const numeroCliente = body.numeroCliente ?? `HML-${String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0")}`;
    const vencimento = vencimentoHml();
    if (body.acao === "smoke") {
      const { data: local, error } = await sb.rpc("fn_boleto_linha_digitavel", { p_nosso_numero: numero, p_vencimento: vencimento, p_valor: 1.00 });
      if (error) throw new Error(`Calcular linha digitável local: ${error.message}`);
      const l = objeto(Array.isArray(local) ? local[0] : local);
      linhaLocal = l.linha == null ? null : String(l.linha);
      barrasLocal = l.barras == null ? null : String(l.barras);
      if (!linhaLocal || !barrasLocal) throw new Error("Cálculo local não devolveu linha/barras");
    }
    const executar = async (etapa: string) => {
      try {
        const bearer = await token();
        let endpoint: string;
        let payload = null;
        if (etapa === "registrar") {
          const { data: end, error } = await sb.from("parceiros_comerciais").select("logradouro,numero,bairro,cidade,uf,cep").eq("cnpj", "63591078000148").order("created_at").limit(1).maybeSingle();
          if (error || !end) throw new Error(`Ler endereço Fetely: ${error?.message ?? "cadastro ausente"}`);
          payload = payloadHml(params, end, String(numero), numeroCliente, vencimento);
          endpoint = "/gateway/cobrancas/v1/boletos";
        } else {
          const consulta = etapa === "consultar_boleto";
          const query = new URLSearchParams({ agencia: params.agencia_4d, conta: params.conta_7d, [consulta ? "numeroDoBoleto" : "numero"]: String(numero), [consulta ? "seuNumero" : "numeroCliente"]: numeroCliente });
          endpoint = `${consulta ? "/gateway/cobrancas-consulta/v1/consultarBoleto" : "/gateway/cobrancas/v1/boletos"}?${query}`;
        }
        const r = await chamar(endpoint, etapa === "registrar" ? "POST" : "GET", payload, bearer);
        barras = extrairBarras(r.corpo) ?? barras;
        etapas.push({ etapa, http_status: r.http_status, resumo: redigir(r.corpo, segredos), erro: null });
        return r;
      } catch (e) {
        const etapaErro = cached ? etapa : "token";
        etapas.push({ etapa: etapaErro, http_status: e instanceof FalhaSafra ? e.status : null, resumo: null, erro: String(redigir(e instanceof Error ? e.message : String(e), segredos)), erro_codigo: e instanceof FalhaSafra ? e.codigo : "INTERNAL_ERROR" });
        throw e;
      }
    };
    for (const etapa of body.acao === "smoke" ? ["registrar", "consultar_registro", "consultar_boleto"] : [body.acao]) await executar(etapa);
    return json({ ok: true, etapas, nosso_numero: numero, codigo_barras: barras, linha_digitavel_local: linhaLocal, codigo_barras_local: barrasLocal, barras_conferem: barras && barrasLocal ? barras === barrasLocal : null });
  } catch (e) {
    const erro = String(redigir(e instanceof Error ? e.message : String(e), segredos));
    return json({ ok: false, etapas, nosso_numero: numero, codigo_barras: barras, linha_digitavel_local: linhaLocal, codigo_barras_local: barrasLocal, barras_conferem: barras && barrasLocal ? barras === barrasLocal : null, erro_codigo: e instanceof FalhaSafra ? e.codigo : "INTERNAL_ERROR", erro }, e instanceof FalhaSafra ? e.status : 500);
  }
});