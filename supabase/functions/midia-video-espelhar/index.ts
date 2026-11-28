// Repositório de Mídia · F4 vídeo (mapa-repositorio-midia-v1, 28/11/2026).
// Busca o mp4 de cada vídeo Shopify (origem_ref = id numérico da mídia) pelo Admin GraphQL e
// guarda em produto-midia/shopify/{origem_ref}.mp4, atualizando TODAS as linhas daquele origem_ref.
// Cron (x-cron-secret) ou sessão. Erro de download/upload vira video_status='erro' e não repete sozinho.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { gateCronOuSessao } from "../_shared/gate-cron.ts";
import { makeShopifyAdmin, type ShopifyAdmin } from "../_shared/shopify/admin-client.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const BUCKET = "produto-midia";
const ORCAMENTO_MS = 50_000;
const CONCORRENCIA = 2;
const Corpo = z.object({ limite: z.number().int().min(1).max(200).optional(), origem_ref: z.string().min(1).max(300).optional() });
const QUERY = `query($id: ID!) { node(id: $id) { ... on Video { status duration sources { url mimeType format height width fileSize } } } }`;
type Source = { url: string; mimeType: string; height: number | null; fileSize: number | null };

function escolher(sources: Source[]): Source | null {
  const mp4 = sources.filter((s) => s.mimeType === "video/mp4" && s.url);
  if (!mp4.length) return null;
  const h = (s: Source) => s.height ?? 0;
  const ate1080 = mp4.filter((s) => h(s) <= 1080).sort((a, b) => h(b) - h(a));
  return ate1080[0] ?? mp4.sort((a, b) => h(b) - h(a))[0];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const negado = await gateCronOuSessao(req, sb, corsHeaders);
  if (negado) return negado;
  const p = Corpo.safeParse((await req.json().catch(() => ({}))) ?? {});
  if (!p.success) return json({ ok: false, erro: p.error.flatten().fieldErrors }, 400);
  const limite = p.data.limite ?? 10;

  let q = sb.from("produto_midia").select("origem_ref,created_at").eq("tipo", "video").eq("ativo", true).order("created_at").limit(2000);
  q = p.data.origem_ref ? q.eq("origem_ref", p.data.origem_ref) : q.eq("video_status", "pendente");
  const { data: linhas, error: el } = await q;
  if (el) return json({ ok: false, erro: `produto_midia: ${el.message}` }, 500);
  const refs = [...new Set((linhas ?? []).map((l) => l.origem_ref as string).filter(Boolean))].slice(0, limite);

  let admin: ShopifyAdmin;
  try { admin = await makeShopifyAdmin(sb); } catch (e) { return json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, 500); }

  let processados = 0, copiados = 0;
  const erros: { origem_ref: string; erro: string }[] = [];
  const gravar = async (ref: string, campos: Record<string, unknown>) => {
    const { error } = await sb.from("produto_midia").update({ ...campos, updated_at: new Date().toISOString() }).eq("tipo", "video").eq("origem_ref", ref);
    if (error) throw new Error(`gravar produto_midia: ${error.message}`);
  };

  async function espelhar(ref: string) {
    try {
      const r = await admin.gql<{ node: { status: string; duration: number | null; sources: Source[] } | null }>(QUERY, { id: `gid://shopify/Video/${ref}` });
      if (r.errors?.length || r.status !== 200) throw new Error(`Shopify GraphQL ${r.status}: ${JSON.stringify(r.errors ?? r.body).slice(0, 200)}`);
      const v = r.data?.node;
      const src = v ? escolher(v.sources ?? []) : null;
      if (!v || v.status !== "READY" || !src) {
        await gravar(ref, { video_erro: "ainda processando na Shopify" });
        erros.push({ origem_ref: ref, erro: `ainda processando na Shopify (status ${v?.status ?? "sem nó"})` });
        return;
      }
      try {
        const d = await fetch(src.url);
        if (d.status !== 200) throw new Error(`download ${d.status}`);
        const bytes = new Uint8Array(await d.arrayBuffer());
        const caminho = `shopify/${ref}.mp4`;
        const { error } = await sb.storage.from(BUCKET).upload(caminho, bytes, { upsert: true, contentType: "video/mp4", cacheControl: "31536000" });
        if (error) throw new Error(`upload: ${error.message}`);
        await gravar(ref, {
          video_url_fonte: src.url, video_url: sb.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl,
          video_bytes: bytes.length, video_duracao_s: v.duration != null ? Math.round(v.duration / 1000) : null,
          video_status: "copiado", video_erro: null,
        });
        copiados++;
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
        erros.push({ origem_ref: ref, erro: msg });
        await gravar(ref, { video_status: "erro", video_erro: msg, video_url_fonte: src.url }).catch((x) => console.error(`[midia-video-espelhar] ${ref}: ${x}`));
      }
    } catch (e) {
      erros.push({ origem_ref: ref, erro: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    } finally { processados++; }
  }

  let i = 0;
  const trabalhador = async () => { while (i < refs.length && Date.now() - t0 < ORCAMENTO_MS) await espelhar(refs[i++]); };
  await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, refs.length) }, trabalhador));

  const { data: rest, error: er } = await sb.from("produto_midia").select("origem_ref").eq("tipo", "video").eq("ativo", true).eq("video_status", "pendente").limit(5000);
  if (er) return json({ ok: false, erro: `contagem de restantes: ${er.message}`, processados, copiados, erros }, 500);
  const restantes = new Set((rest ?? []).map((l) => l.origem_ref)).size;
  console.log(`[midia-video-espelhar] processados=${processados} copiados=${copiados} erros=${erros.length} restantes=${restantes} ${Date.now() - t0}ms`);
  return json({ ok: true, processados, copiados, erros, restantes });
});
