// SONDA (28/11/2026): só GETs, exceto acao=teste_escrita (um PUT com os mesmos valores) na API v3 do Bling para avaliar anúncios do
// Mercado Livre via Bling. Nada é gravado no SNCF nem no Bling (exceto renovação de token).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { BLING_BASE, blingHeaders, ensureFreshToken, refreshAccessToken } from "../_shared/bling/bling-client.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const tipos = (o: unknown) => o && typeof o === "object" ? Object.fromEntries(Object.entries(o as Record<string, unknown>).map(([k, v]) => [k, Array.isArray(v) ? "array" : v === null ? "null" : typeof v])) : null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ ok: false, erro: "Não autorizado" }, 401);
    const { data: u, error: eu } = await sb.auth.getUser(auth.slice(7));
    if (eu || !u.user) return json({ ok: false, erro: "Não autorizado" }, 401);
    const { data: adm, error: ea } = await sb.rpc("has_role", { _user_id: u.user.id, _role: "super_admin" });
    if (ea) return json({ ok: false, erro: `has_role: ${ea.message}` }, 500);
    if (!adm) return json({ ok: false, erro: "Só super admin." }, 403);

    const idLoja = 206328814;
    const { data: cfg, error: ec } = await sb.from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle();
    if (ec || !cfg) return json({ ok: false, erro: `Config Bling: ${ec?.message ?? "ausente"}` }, 500);
    let token = await ensureFreshToken(sb, cfg as any);

    const sondas: any[] = [];
    async function get(path: string, guardar = true) {
      let r = await fetch(`${BLING_BASE}${path}`, { headers: blingHeaders(token) });
      if (r.status === 401) { token = await refreshAccessToken(sb, { ...(cfg as any), access_token: token }); r = await fetch(`${BLING_BASE}${path}`, { headers: blingHeaders(token) }); }
      if (r.status === 429) { await new Promise((x) => setTimeout(x, 1200)); r = await fetch(`${BLING_BASE}${path}`, { headers: blingHeaders(token) }); }
      const txt = await r.text(); let body: any = null; try { body = JSON.parse(txt); } catch { body = txt.slice(0, 1000); }
      const data = body?.data; const arr = Array.isArray(data) ? data : data ? [data] : [];
      const s = { url: `${BLING_BASE}${path}`, status: r.status, total: arr.length, chaves: tipos(arr[0]), exemplos: arr.slice(0, 2), erro: r.ok ? null : body };
      if (guardar) sondas.push(s);
      await new Promise((x) => setTimeout(x, 350)); // limite de 3 req/s
      return { s, arr };
    }

    const corpoReq: any = await req.json().catch(() => ({}));
    if (corpoReq?.acao === "teste_escrita") {
      // ÚNICA escrita permitida: PUT idempotente com os mesmos valores lidos, para provar o escopo.
      const id = 70189833; const q = `?tipoIntegracao=MercadoLivre&idLoja=${idLoja}`;
      const ler = async () => {
        let r = await fetch(`${BLING_BASE}/anuncios/${id}${q}`, { headers: blingHeaders(token) });
        if (r.status === 401) { token = await refreshAccessToken(sb, { ...(cfg as any), access_token: token }); r = await fetch(`${BLING_BASE}/anuncios/${id}${q}`, { headers: blingHeaders(token) }); }
        const b = await r.json().catch(() => null); return { status: r.status, data: b?.data ?? null, erro: r.ok ? null : b };
      };
      const antes = await ler();
      if (antes.status !== 200 || !antes.data) return json({ ok: false, erro: "GET antes falhou", antes }, 502);
      const a = antes.data;
      const enviado: any = {
        produto: { id: a.produto?.id }, integracao: { tipo: "MercadoLivre" }, loja: { id: idLoja },
        nome: a.titulo ?? a.nome, descricao: a.descricao ?? "",
        preco: { valor: a.preco?.valor, promocional: a.preco?.promocional },
        anuncioLoja: { id: a.anuncioLoja?.id },
      };
      await new Promise((x) => setTimeout(x, 400));
      const rp = await fetch(`${BLING_BASE}/anuncios/${id}${q}`, { method: "PUT", headers: { ...blingHeaders(token), "Content-Type": "application/json" }, body: JSON.stringify(enviado) });
      const txt = await rp.text(); let corpo: any; try { corpo = JSON.parse(txt); } catch { corpo = txt.slice(0, 2000); }
      await new Promise((x) => setTimeout(x, 1500));
      const depois = await ler();
      const resumo = (d: any) => ({ titulo: d?.titulo, preco_valor: d?.preco?.valor, preco_promocional: d?.preco?.promocional, status: d?.status, situacao: d?.situacao, imagens: (d?.imagens ?? []).length, atributos: (d?.atributos ?? []).length });
      const ra = resumo(a), rd = resumo(depois.data);
      const diferencas = Object.keys(ra).filter((k) => JSON.stringify((ra as any)[k]) !== JSON.stringify((rd as any)[k])).map((k) => ({ campo: k, antes: (ra as any)[k], depois: (rd as any)[k] }));
      return json({ ok: rp.ok, antes: a, enviado, resposta_put: { status: rp.status, corpo }, depois: depois.data, resumo_antes: ra, resumo_depois: rd, diferencas });
    }

    // 1) listagem com variações
    const variacoes = [
      `/anuncios?idLoja=${idLoja}&tipoIntegracao=MercadoLivre&pagina=1&limite=100`,
      `/anuncios?idLoja=${idLoja}&pagina=1&limite=100`,
      `/anuncios?tipoIntegracao=MercadoLivre&pagina=1&limite=100`,
      `/anuncios?pagina=1&limite=100`,
    ];
    let lista: any[] = []; let base: string | null = null;
    for (const v of variacoes) { const { s, arr } = await get(v); if (s.status === 200 && !lista.length && arr.length) { lista = arr; base = v; } }
    for (const sit of [1, 2, 3, 4, 5]) await get(`/anuncios?idLoja=${idLoja}&tipoIntegracao=MercadoLivre&situacao=${sit}&pagina=1&limite=100`);

    // 2) detalhe
    if (lista[0]?.id) await get(`/anuncios/${lista[0].id}${base?.includes("tipoIntegracao") ? `?tipoIntegracao=MercadoLivre&idLoja=${idLoja}` : ""}`);
    // 3) categorias
    for (const p of [`/anuncios/categorias?tipoIntegracao=MercadoLivre&idLoja=${idLoja}`, `/anuncios/categorias?idLoja=${idLoja}`, `/categorias/lojas?idLoja=${idLoja}`]) await get(p);
    // 4) produtos × loja
    await get(`/produtos/lojas?idLoja=${idLoja}&pagina=1&limite=100`);

    // 5) contagem por situação (paginação completa da melhor variação, teto 30 páginas)
    const porSituacao: Record<string, number> = {}; let totalAnuncios = 0; let paginas = 0;
    if (base) {
      for (let p = 1; p <= 30; p++) {
        const { s, arr } = await get(base.replace("pagina=1", `pagina=${p}`), false); paginas = p;
        if (s.status !== 200 || !arr.length) break;
        for (const a of arr) { const k = String(a?.situacao ?? a?.status ?? "sem_situacao"); porSituacao[k] = (porSituacao[k] ?? 0) + 1; totalAnuncios++; }
        if (arr.length < 100) break;
      }
    }
    return json({ ok: true, idLoja, listagem_usada: base, sondas, contagem: { total: totalAnuncios, paginas, por_situacao: porSituacao } });
  } catch (e) {
    return json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
