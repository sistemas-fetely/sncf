import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Contrato:
//  - Modo simples (legado, inalterado): {cep_origem, cep_destino, peso_g, comprimento_cm?, largura_cm?, altura_cm?, servicos?}
//  - Modo volumes (28/09, frente Cotação Correios B2B): {cep_origem, cep_destino, volumes:[{peso_g, comprimento_cm?, largura_cm?, altura_cm?, quantidade?}], servicos?}
//    Cota cada grupo UMA vez por serviço, multiplica pela quantidade e soma. Se um grupo falha, o serviço volta sem preço e com erro (não soma parcial).

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const BASE = "https://api.correios.com.br";
const NOMES: Record<string, string> = { "03220": "SEDEX", "03298": "PAC" };
const PESO_MIN_G = 300;
const TIMEOUT_MS = 10_000;
const MAX_GRUPOS = 10;
const MAX_QTD = 500;

type Vol = { peso: number; comp: number; larg: number; alt: number; qtd: number; minAplicado: boolean };

function resp(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}
function fail(erro: string, status: number) {
  console.error("[correios-cotar] FAIL:", erro);
  return resp({ ok: false, erro }, status);
}

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

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

function parseVol(v: any, rotulo: string, aceitaQtd: boolean): Vol {
  if (v === null || typeof v !== "object") throw new Error(`${rotulo}: volume inválido`);
  const pesoIn = Number(v.peso_g);
  if (!Number.isFinite(pesoIn) || pesoIn <= 0) throw new Error(`${rotulo}: peso_g obrigatório (número > 0)`);
  const dim = (x: unknown, def: number, nome: string) => {
    if (x === undefined || x === null) return def;
    const n = Number(x);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`${rotulo}: ${nome} inválido`);
    return n;
  };
  let qtd = 1;
  if (aceitaQtd && v.quantidade !== undefined && v.quantidade !== null) {
    qtd = Number(v.quantidade);
    if (!Number.isInteger(qtd) || qtd < 1 || qtd > MAX_QTD) throw new Error(`${rotulo}: quantidade deve ser inteiro de 1 a ${MAX_QTD}`);
  }
  return {
    peso: Math.ceil(Math.max(pesoIn, PESO_MIN_G)),
    comp: dim(v.comprimento_cm, 20, "comprimento_cm"),
    larg: dim(v.largura_cm, 15, "largura_cm"),
    alt: dim(v.altura_cm, 10, "altura_cm"),
    qtd,
    minAplicado: pesoIn < PESO_MIN_G,
  };
}

function lerPreco(json: any): number {
  const bruto = json?.pcFinal;
  const n = Number(String(bruto ?? "").replace(/\./g, "").replace(",", "."));
  if (bruto == null || !Number.isFinite(n)) throw new Error(json?.txErro ?? json?.msgErro ?? "resposta sem pcFinal");
  return n;
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

    let body: Record<string, any>;
    try { body = await req.json(); } catch { return fail("corpo não é JSON válido", 400); }

    const cepO = digits(body.cep_origem);
    const cepD = digits(body.cep_destino);
    if (cepO.length !== 8) return fail("cep_origem inválido (8 dígitos)", 400);
    if (cepD.length !== 8) return fail("cep_destino inválido (8 dígitos)", 400);

    // Modo registrar (Venda Direta): peso vem de fn_frete_preparar_cotacao (fonte única) e a
    // cotação é gravada em frete_cotacao — sem gravar, a cotação não vale para o pedido.
    const registrar = body.registrar === true;
    const sb = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let itensReg: { sku: string; quantidade: number }[] = [];
    let itensHash: string | null = null;
    let pesoIncompleto = false;
    const contexto = typeof body.contexto === "string" && body.contexto.trim() ? body.contexto.trim() : "venda_direta";
    if (registrar) {
      if (!Array.isArray(body.itens) || body.itens.length === 0) return fail("registrar: itens obrigatório (lista não vazia)", 400);
      try {
        itensReg = body.itens.map((it: any, i: number) => {
          const sku = String(it?.sku ?? "").trim();
          const q = Number(it?.quantidade);
          if (!sku) throw new Error(`itens[${i}]: sku obrigatório`);
          if (!Number.isInteger(q) || q < 1) throw new Error(`itens[${i}]: quantidade inteira ≥ 1`);
          return { sku, quantidade: q };
        });
      } catch (e) { return fail((e as Error).message, 400); }
      const { data: prep, error: pErr } = await sb.rpc("fn_frete_preparar_cotacao", { p_itens: itensReg });
      if (pErr) return fail(`fn_frete_preparar_cotacao: ${pErr.message}`, 500);
      const pesoPrep = Number((prep as any)?.peso_g);
      if (!Number.isFinite(pesoPrep) || pesoPrep <= 0) return fail("peso dos itens indisponível (fn_frete_preparar_cotacao sem peso_g)", 422);
      itensHash = (prep as any)?.itens_hash ?? null;
      pesoIncompleto = (prep as any)?.peso_incompleto === true;
      body.peso_g = pesoPrep;
      delete body.volumes;
    }

    const modoVolumes = body.volumes !== undefined;
    let vols: Vol[];
    try {
      if (modoVolumes) {
        if (!Array.isArray(body.volumes) || body.volumes.length === 0) throw new Error("volumes deve ser lista não vazia");
        if (body.volumes.length > MAX_GRUPOS) throw new Error(`no máximo ${MAX_GRUPOS} grupos de volumes`);
        vols = body.volumes.map((v: any, i: number) => parseVol(v, `volumes[${i}]`, true));
      } else {
        vols = [parseVol(body, "pedido", false)];
      }
    } catch (e) { return fail((e as Error).message, 400); }

    const servicos = body.servicos === undefined ? ["03220", "03298"] : body.servicos;
    if (!Array.isArray(servicos) || servicos.length === 0 || servicos.some((s: unknown) => typeof s !== "string" || !/^\d{5}$/.test(s))) {
      return fail("servicos deve ser lista de códigos com 5 dígitos", 400);
    }

    const { data: tk, error: tkErr } = await sb
      .from("correios_token")
      .select("token, expira_em")
      .eq("id", "singleton")
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
      const qz = new URLSearchParams({ cepOrigem: cepO, cepDestino: cepD });
      const prazoP = getJson(`${BASE}/prazo/v1/nacional/${codigo}?${qz}`, tk.token);
      const precosP = vols.map((v) => {
        const qp = new URLSearchParams({
          cepOrigem: cepO, cepDestino: cepD, psObjeto: String(v.peso), tpObjeto: "2",
          comprimento: String(v.comp), largura: String(v.larg), altura: String(v.alt),
          nuContrato: contrato, nuDR: String(dr),
        });
        return getJson(`${BASE}/preco/v1/nacional/${codigo}?${qp}`, tk.token).then(lerPreco);
      });
      const [z, ...ps] = await Promise.allSettled([prazoP, ...precosP]);

      let preco: number | null = null;
      let erro: string | null = null;
      const falhas = ps.map((p, i) => p.status === "rejected"
        ? `${modoVolumes ? `volumes[${i}] ` : ""}preço: ${p.reason instanceof Error ? p.reason.message : String(p.reason)}`
        : null).filter(Boolean) as string[];
      if (falhas.length) erro = falhas.join("; ");
      else preco = Math.round(ps.reduce((s, p, i) => s + (p as PromiseFulfilledResult<number>).value * vols[i].qtd, 0) * 100) / 100;

      let prazo: number | null = null;
      if (z.status === "fulfilled" && (z.value as any)?.prazoEntrega != null) {
        const d = Number((z.value as any).prazoEntrega);
        prazo = Number.isFinite(d) ? d : null;
      } else if (z.status === "rejected") {
        console.warn(`[correios-cotar] prazo ${codigo} falhou:`, z.reason instanceof Error ? z.reason.message : z.reason);
      }

      const base: Record<string, unknown> = { codigo, servico: nome, preco, prazo_dias: prazo, erro };
      if (modoVolumes) {
        base.por_volume = vols.map((v, i) => {
          const unit = ps[i].status === "fulfilled" ? (ps[i] as PromiseFulfilledResult<number>).value : null;
          return { grupo: i, quantidade: v.qtd, peso_g: v.peso, comprimento_cm: v.comp, largura_cm: v.larg, altura_cm: v.alt,
                   preco_unit: unit, subtotal: unit == null ? null : Math.round(unit * v.qtd * 100) / 100 };
        });
      }
      return base;
    }));

    const pesoTotal = vols.reduce((s, v) => s + v.peso * v.qtd, 0);
    const nVol = vols.reduce((s, v) => s + v.qtd, 0);
    const minAplicado = vols.some((v) => v.minAplicado);

    console.log("[correios-cotar]", JSON.stringify({
      origem: cepO, destino: cepD, modo: modoVolumes ? "volumes" : "simples", n_volumes: nVol, peso_g: pesoTotal,
      precos: cotacoes.map((c) => ({ c: c.codigo, preco: c.preco, prazo: c.prazo_dias, erro: c.erro })),
      duracao_ms: Date.now() - t0,
    }));

    let registro: Record<string, unknown> = {};
    if (registrar) {
      const { data: par, error: parErr } = await sb
        .from("frete_vd_parametro").select("validade_cotacao_min").eq("id", 1).maybeSingle();
      if (parErr) return fail(`ler frete_vd_parametro: ${parErr.message}`, 500);
      const min = Number(par?.validade_cotacao_min ?? 30);
      const validaAte = new Date(Date.now() + min * 60_000).toISOString();
      const { data: ins, error: insErr } = await sb.from("frete_cotacao").insert({
        contexto, cep_origem: cepO, cep_destino: cepD, peso_g: pesoTotal, itens_hash: itensHash,
        cotacoes, criado_por: u.user.id, valida_ate: validaAte,
      }).select("id, valida_ate").single();
      if (insErr || !ins) return fail(`gravar frete_cotacao: ${insErr?.message ?? "sem retorno"}`, 500);
      registro = { cotacao_id: ins.id, valida_ate: ins.valida_ate, peso_incompleto: pesoIncompleto };
    }

    return resp({
      ...registro,
      ok: true, origem: cepO, destino: cepD, peso_g_cobrado: pesoTotal,
      ...(modoVolumes ? { n_volumes: nVol } : {}),
      ...(minAplicado ? { peso_minimo_aplicado: true } : {}),
      contrato, dr, cotacoes,
    });
  } catch (e) {
    return fail(`erro não tratado: ${e instanceof Error ? e.message : String(e)}`, 500);
  }
});
