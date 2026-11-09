// Applies catalog cells of both owners (produto and operacoes/fiscal) in the FOP (Mapa v2); the SNCF
// only marks them via fn_catalogo_resolver (p_dono per owner) after the FOP confirms, because the
// FOP mirror (fn_upsert_catalogo) overwrote fiscal fields written directly in sncf_produtos.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { aplicarNoFop, type CelulaFop } from "../_shared/catalogo-planilha/aplicar-fop.ts";

const Body = z.object({ leitura_id: z.string().uuid(), ids: z.array(z.string().uuid()).min(1).max(5000) }).strict();
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const msg = (e: unknown) => e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, erro: "Use POST." }, 405);
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ ok: false, erro: "Sessão obrigatória." }, 401);
  const usuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const sb = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
  try {
    const { data: u, error: eU } = await usuario.auth.getUser(authHeader.slice(7));
    if (eU || !u.user) return json({ ok: false, erro: "Sessão inválida." }, 401);
    const perm = await usuario.rpc("usuario_tem_acao", { p_slug: "acao.produto_importar_planilha_cadastro" });
    if (perm.error) throw perm.error;
    if (perm.data !== true) return json({ ok: false, erro: "Sem permissão para aplicar catálogo." }, 403);
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ ok: false, erro: "Pedido inválido.", detalhes: parsed.error.flatten().fieldErrors }, 400);
    const { leitura_id, ids } = parsed.data;

    const ref = await sb.from("catalogo_planilha_leitura").select("id").eq("ambiente", "oficial").in("status", ["comparada", "aplicada_parcial", "aplicada"]).order("lida_em", { ascending: false }).limit(1).maybeSingle();
    if (ref.error) throw ref.error;
    if (ref.data?.id !== leitura_id) return json({ ok: false, erro: "Há uma leitura mais nova. Recarregue a tela." }, 409);

    const celulas: CelulaFop[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const r = await sb.from("catalogo_planilha_mudanca").select("id,cod_cadastro,campo,dono,tipo,status,leitura_id,valor_planilha,valor_sistema").in("id", ids.slice(i, i + 200));
      if (r.error) throw r.error;
      celulas.push(...(r.data ?? []) as CelulaFop[]);
    }
    const perfil = await sb.from("profiles").select("full_name").eq("user_id", u.user.id).maybeSingle();
    if (perfil.error) throw perfil.error;
    const quem = { id: u.user.id, nome: perfil.data?.full_name || u.user.email || u.user.id };

    const cfg = await sb.from("integracoes_config").select("config").eq("sistema", "fop").maybeSingle();
    if (cfg.error) throw cfg.error;
    const base = String((cfg.data?.config as Record<string, unknown> | null)?.fop_base_url ?? "").replace(/\/+$/, "");
    if (!/^https:\/\//.test(base)) return json({ ok: false, erro: "Endereço do FOP não configurado em TI › Integrações." }, 500);
    const tk = await sb.rpc("get_vault_secret", { p_name: "FOP_INBOUND_TOKEN" });
    if (tk.error || !tk.data) return json({ ok: false, erro: "FOP_INBOUND_TOKEN indisponível no Vault." }, 500);

    const resumo = await aplicarNoFop(celulas, ids, leitura_id, quem, {
      chamarFop: async corpo => {
        const r = await fetch(`${base}/api/public/catalogo-planilha-aplicar`, { method: "POST", headers: { Authorization: `Bearer ${tk.data}`, "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
        const texto = await r.text();
        if (!r.ok) throw new Error(`HTTP ${r.status}${texto ? ` — ${texto.slice(0, 300)}` : ""}`);
        try { return JSON.parse(texto); } catch { throw new Error("FOP devolveu resposta que não é JSON"); }
      },
      concluir: async (lista, acao, dono) => {
        const r = await sb.rpc("fn_catalogo_resolver", { p_ids: lista, p_acao: acao, p_escolha: "planilha", p_dono: dono, p_ator: quem.id });
        if (r.error) throw new Error(`FOP aplicou, mas o SNCF não registrou: ${r.error.message}`);
        const d = r.data as { ok: boolean; resultados: { ok: boolean; erro?: string }[] };
        if (!d.ok) throw new Error(`FOP aplicou, mas o SNCF não registrou: ${d.resultados.filter(x => !x.ok).map(x => x.erro).join("; ")}`);
      },
      registrar: async pendentes => {
        const r = await sb.rpc("fn_catalogo_fop_registrar", { p_resultados: pendentes });
        if (r.error) throw new Error(`Não foi possível registrar a resposta do FOP: ${r.error.message}`);
      },
    });
    return json({ ok: true, ...resumo });
  } catch (e) {
    console.error("[catalogo-planilha-aplicar-fop]", msg(e));
    return json({ ok: false, erro: msg(e) }, 502);
  }
});
