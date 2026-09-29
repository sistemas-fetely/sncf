import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const BASE = "https://api.correios.com.br";
const NOMES: Record<string, string> = { "03220": "SEDEX", "03298": "PAC" };
const PESO_MIN_G = 300;
const TIMEOUT_MS = 10_000;

function resp(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}
function fail(erro: string, status: number) {
  console.error("[correios-cotar] FAIL:", erro);
  return resp({ ok: false, erro }, status);
}

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

// Lê o payload do JWT dos Correios (só a parte do meio, base64url). Não valida assinatura: só extrai contrato/DR.
function payloadJwt(token: string): Record<string, any> {
  const parte = token.split(".")[1];
  if (!parte) throw new Error("token Correios malformado");
  const b64 = parte.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(pad);
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}

async function getJson(url: string, token: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: ctrl.signal,
    });
    const txt = await r.text();
    let json: any = null;
    try { json = txt ? JSON.parse(txt) : null; } catch { /* corpo não-JSON */ }
    if (!r.ok) {
      const msg = json?.msgs?.join?.("; ") ?? json?.txErro ?? json?.mensagem ?? txt.slice(0, 200);
      throw new Error(`HTTP ${r.status}: ${msg}`);
    }
    return json;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw new Error("timeout de 10s");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return fail("use POST", 405);
  const t0 = Date.now();

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization");
    if (!auth) return fail("não autorizado", 401);
    const authClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u, error: uErr } = await authClient.auth.getUser();
    if (uErr || !u?.user) return fail("não autorizado", 401);

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return fail("corpo não é JSON válido", 400); }

    const cepO = digits(body.cep_origem);
    const cepD = digits(body.cep_destino);
    if (cepO.length !== 8) return fail("cep_origem inválido (8 dígitos)", 400);
    if (cepD.length !== 8) return fail("cep_destino inválido (8 dígitos)", 400);

    const pesoIn = Number(body.peso_g);
    if (!Number.isFinite(pesoIn) || pesoIn <= 0) return fail("peso_g obrigatório (número > 0)", 400);
    const pesoMinAplicado = pesoIn < PESO_MIN_G;
    const peso = Math.ceil(Math.max(pesoIn, PESO_MIN_G));

    const dim = (v: unknown, def: number, nome: string) => {
      if (v === undefined || v === null) return def;
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) throw new Error(`${nome} inválido`);
      return n;
    };
    let comp: number, larg: number, alt: number;
    try {
      comp = dim(body.comprimento_cm, 20, "comprimento_cm");
      larg = dim(body.largura_cm, 15, "largura_cm");
      alt = dim(body.altura_cm, 10, "altura_cm");
    } catch (e) { return fail((e as Error).message, 400); }

    const servicos = body.servicos === undefined ? ["03220", "03298"] : body.servicos;
    if (!Array.isArray(servicos) || servicos.length === 0 || servicos.some((s) => typeof s !== "string" || !/^\d{5}$/.test(s))) {
      return fail("servicos deve ser lista de códigos com 5 dígitos", 400);
    }

    const sb = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: tk, error: tkErr } = await sb
      .from("correios_token")
      .select("token, expira_em")
      .eq("ambiente", "PRODUCAO")
      .order("atualizado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (tkErr) return fail(`erro ao ler token Correios: ${tkErr.message}`, 500);
    if (!tk?.token) return fail("token Correios ausente", 503);
    if (new Date(tk.expira_em).getTime() <= Date.now()) return fail("token Correios expirado — renovação diária não rodou", 503);

    let contrato: string, dr: number;
    try {
      const cp = payloadJwt(tk.token)["cartao-postagem"];
      contrato = String(cp?.contrato ?? "");
      dr = Number(cp?.dr);
      if (!contrato || !Number.isFinite(dr)) throw new Error("contrato/DR ausentes no token");
    } catch (e) {
      return fail(`token Correios ilegível: ${(e as Error).message}`, 500);
    }

    const cotacoes = await Promise.all((servicos as string[]).map(async (codigo) => {
      const nome = NOMES[codigo] ?? codigo;
      const qp = new URLSearchParams({
        cepOrigem: cepO, cepDestino: cepD, psObjeto: String(peso), tpObjeto: "2",
        comprimento: String(comp), largura: String(larg), altura: String(alt),
        nuContrato: contrato, nuDR: String(dr),
      });
      const qz = new URLSearchParams({ cepOrigem: cepO, cepDestino: cepD });
      const [p, z] = await Promise.allSettled([
        getJson(`${BASE}/preco/v1/nacional/${codigo}?${qp}`, tk.token),
        getJson(`${BASE}/prazo/v1/nacional/${codigo}?${qz}`, tk.token),
      ]);
      let preco: number | null = null;
      let erro: string | null = null;
      if (p.status === "fulfilled") {
        const bruto = p.value?.pcFinal;
        const n = Number(String(bruto ?? "").replace(/\./g, "").replace(",", "."));
        if (bruto != null && Number.isFinite(n)) preco = n;
        else erro = p.value?.txErro ?? p.value?.msgErro ?? "resposta sem pcFinal";
      } else {
        erro = `preço: ${p.reason instanceof Error ? p.reason.message : String(p.reason)}`;
      }
      // Prazo é opcional: falha nele não invalida o preço.
      let prazo: number | null = null;
      if (z.status === "fulfilled" && z.value?.prazoEntrega != null) {
        const d = Number(z.value.prazoEntrega);
        prazo = Number.isFinite(d) ? d : null;
      } else if (z.status === "rejected") {
        console.warn(`[correios-cotar] prazo ${codigo} falhou:`, z.reason instanceof Error ? z.reason.message : z.reason);
      }
      return { codigo, servico: nome, preco, prazo_dias: prazo, erro };
    }));

    console.log("[correios-cotar]", JSON.stringify({
      origem: cepO, destino: cepD, peso_g: peso,
      precos: cotacoes.map((c) => ({ c: c.codigo, preco: c.preco, prazo: c.prazo_dias, erro: c.erro })),
      duracao_ms: Date.now() - t0,
    }));

    return resp({
      ok: true, origem: cepO, destino: cepD, peso_g_cobrado: peso,
      ...(pesoMinAplicado ? { peso_minimo_aplicado: true } : {}),
      contrato, dr, cotacoes,
    });
  } catch (e) {
    return fail(`erro não tratado: ${e instanceof Error ? e.message : String(e)}`, 500);
  }
});
