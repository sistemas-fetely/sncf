// Repositório de Mídia · espelho dos arquivos da Shopify no bucket produto-midia (mapa-repositorio-midia-v1, 28/11/2026).
// Cron (x-cron-secret) ou sessão. Um arquivo por origem_ref: copia uma vez e atualiza TODAS as linhas daquele origem_ref.
// Versão 800 px vem da própria CDN da Shopify (&width=800); a edge não processa imagem.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { gateCronOuSessao } from "../_shared/gate-cron.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const BUCKET = "produto-midia";
const ORCAMENTO_MS = 50_000;
const CONCORRENCIA = 4;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp" };
const Corpo = z.object({ limite: z.number().int().min(1).max(500).optional(), origem_ref: z.string().min(1).max(300).optional() });
type Pendente = { origem_ref: string; url_fonte: string; tipo: string };

const com800 = (url: string) => url + (url.includes("?") ? "&" : "?") + "width=800";
async function baixar(url: string) {
  const r = await fetch(url);
  if (r.status !== 200) throw new Error(`download ${r.status} em ${url.slice(0, 120)}`);
  const tipo = (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  return { bytes: new Uint8Array(await r.arrayBuffer()), tipo: tipo || "image/jpeg" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const negado = await gateCronOuSessao(req, sb, corsHeaders);
  if (negado) return negado;
  const bruto = await req.json().catch(() => ({}));
  const p = Corpo.safeParse(bruto ?? {});
  if (!p.success) return json({ ok: false, erro: p.error.flatten().fieldErrors }, 400);
  const limite = p.data.limite ?? 40;
  const ref = p.data.origem_ref;

  // Pendentes agrupados por (origem_ref, url_fonte, tipo), ordem pelo created_at mais antigo.
  const pendentes: Pendente[] = [];
  const vistos = new Set<string>();
  for (let de = 0; pendentes.length < limite; de += 1000) {
    let q = sb.from("produto_midia").select("origem_ref,url_fonte,tipo,created_at")
      .eq("ativo", true).is("url_original", null).eq("origem", "shopify").not("url_fonte", "is", null)
      .order("created_at").order("id").range(de, de + 999);
    q = ref ? q.eq("origem_ref", ref) : q.lt("tentativas", 3);
    const { data, error } = await q;
    if (error) return json({ ok: false, erro: `produto_midia: ${error.message}` }, 500);
    for (const l of data ?? []) {
      const k = `${l.origem_ref}|${l.url_fonte}|${l.tipo}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      pendentes.push({ origem_ref: l.origem_ref, url_fonte: l.url_fonte!, tipo: l.tipo });
      if (pendentes.length >= limite) break;
    }
    if (!data || data.length < 1000) break;
  }

  let processados = 0, copiados = 0;
  const erros: { origem_ref: string; erro: string }[] = [];

  async function falhar(origem_ref: string, msg: string) {
    erros.push({ origem_ref, erro: msg });
    const { data, error } = await sb.from("produto_midia").select("id,tentativas").eq("origem", "shopify").eq("origem_ref", origem_ref);
    if (error) { console.error(`[midia-espelhar] ler tentativas ${origem_ref}: ${error.message}`); return; }
    for (const l of data ?? []) {
      const { error: eu } = await sb.from("produto_midia").update({ tentativas: (l.tentativas ?? 0) + 1, erro: msg.slice(0, 300), updated_at: new Date().toISOString() }).eq("id", l.id);
      if (eu) console.error(`[midia-espelhar] gravar erro ${origem_ref}: ${eu.message}`);
    }
  }

  async function espelhar(m: Pendente) {
    try {
      const orig = await baixar(m.url_fonte);
      const r800 = await baixar(com800(m.url_fonte));
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", orig.bytes))).map((b) => b.toString(16).padStart(2, "0")).join("");
      const ext = EXT[orig.tipo] ?? "jpg";
      const ext800 = EXT[r800.tipo] ?? ext;
      const caminho = `shopify/${m.origem_ref}.${ext}`, caminho800 = `shopify/${m.origem_ref}_800.${ext800}`;
      for (const [c, f] of [[caminho, orig], [caminho800, r800]] as const) {
        const { error } = await sb.storage.from(BUCKET).upload(c, f.bytes, { upsert: true, contentType: f.tipo, cacheControl: "31536000" });
        if (error) throw new Error(`upload ${c}: ${error.message}`);
      }
      const url = (c: string) => sb.storage.from(BUCKET).getPublicUrl(c).data.publicUrl;
      const agora = new Date().toISOString();
      const { error } = await sb.from("produto_midia").update({ url_original: url(caminho), url_800: url(caminho800), bytes: orig.bytes.length, hash_sha256: hash, espelhado_em: agora, erro: null, updated_at: agora })
        .eq("origem", "shopify").eq("origem_ref", m.origem_ref);
      if (error) throw new Error(`gravar produto_midia: ${error.message}`);
      copiados++;
    } catch (e) {
      await falhar(m.origem_ref, e instanceof Error ? e.message : String(e));
    } finally { processados++; }
  }

  let i = 0;
  const trabalhador = async () => {
    while (i < pendentes.length && Date.now() - t0 < ORCAMENTO_MS) await espelhar(pendentes[i++]);
  };
  await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, pendentes.length) }, trabalhador));

  const { count, error: ec } = await sb.from("produto_midia").select("id", { count: "exact", head: true })
    .eq("ativo", true).is("url_original", null).eq("origem", "shopify").lt("tentativas", 3);
  if (ec) return json({ ok: false, erro: `contagem de restantes: ${ec.message}`, processados, copiados, erros }, 500);
  console.log(`[midia-espelhar] processados=${processados} copiados=${copiados} erros=${erros.length} restantes=${count} ${Date.now() - t0}ms`);
  return json({ ok: true, processados, copiados, erros, restantes: count ?? 0 });
});
