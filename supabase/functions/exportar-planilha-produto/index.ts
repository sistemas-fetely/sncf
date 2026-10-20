// F1 — Exportar planilha de cadastro de produto.
// FOP é o mestre: produtos + fase + pendências vêm de fn_produtos_para_sncf (regra do próprio FOP).
// SNCF entra só como espelho: sugestão "a confirmar" para campo vazio no FOP, mais inner_qtd e
// nome_operacional (que ainda não existem no FOP). Não grava nada. FAIL-LOUD.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const FOP_URL = "https://onalegxugtuxpfhonayq.supabase.co";
const FOP_ANON_KEY = "sb_publishable_LKB5TwMha9KGj8v_YZkquA_Zz8NyriO";
const BLOCOS_FORA = new Set(["estado", "foto"]);
const CAMPOS_FORA = new Set(["foto"]);
// 20/10/2026 (Processo de Produto v2): a planilha é só bloco 1 — dono fetely/sistema.
// Bloco 2 (dono thomer) vive no FOP/Shopify e nunca sai aqui.
const DONOS_PLANILHA = new Set(["fetely", "sistema"]);
// Campos gravados direto em sncf_produtos (não existem no FOP).
const CAMPOS_SNCF = new Set(["nome_operacional", "preco_site", "grupo_tributario_bling"]);
const SO_NASCIMENTO = new Set(["nome_comercial"]);
const GRUPOS_BLING = ["L1 - Produto Nacional Importado", "L2 - Produto Nacional"];

function msg(e: unknown): string {
  if (!e) return "Erro desconhecido";
  if (typeof e === "string") return e;
  const o = e as Record<string, unknown>;
  return String(o.message ?? o.error_description ?? o.error ?? JSON.stringify(e));
}
const vazio = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ ok: false, erro: "Não autenticado" }, 401);
    const { data: u, error: uErr } = await sb.auth.getUser(auth.replace("Bearer ", ""));
    if (uErr || !u?.user) return json({ ok: false, erro: "Sessão inválida" }, 401);

    let body: { colecoes?: unknown; cods?: unknown; so_aguardando_medicao?: unknown; so_contagem?: unknown } = {};
    try { body = await req.json(); } catch { body = {}; }
    let colecoes: string[] | null = null;
    if (body.colecoes !== undefined && body.colecoes !== null) {
      if (!Array.isArray(body.colecoes) || body.colecoes.some((c) => typeof c !== "string" || c.length > 200)) {
        return json({ ok: false, erro: "colecoes deve ser uma lista de textos" }, 400);
      }
      colecoes = (body.colecoes as string[]).length ? (body.colecoes as string[]) : null;
    }
    let cods: Set<string> | null = null;
    if (body.cods !== undefined && body.cods !== null) {
      if (!Array.isArray(body.cods) || body.cods.length > 5000 || body.cods.some((c) => typeof c !== "string" || c.length > 50)) {
        return json({ ok: false, erro: "cods deve ser uma lista de códigos" }, 400);
      }
      cods = new Set((body.cods as string[]).map((c) => c.trim()));
    }
    for (const k of ["so_aguardando_medicao", "so_contagem"] as const) {
      if (body[k] !== undefined && body[k] !== null && typeof body[k] !== "boolean") {
        return json({ ok: false, erro: `${k} deve ser verdadeiro/falso` }, 400);
      }
    }
    const soMedicao = body.so_aguardando_medicao === true;
    const soContagem = body.so_contagem === true;

    const { data: token, error: tErr } = await sb.rpc("get_vault_secret", { p_name: "FOP_INBOUND_TOKEN" });
    if (tErr) throw new Error(`Falha ao ler FOP_INBOUND_TOKEN: ${msg(tErr)}`);
    if (!token) throw new Error("FOP_INBOUND_TOKEN ausente no vault");

    const fop = createClient(FOP_URL, FOP_ANON_KEY, { auth: { persistSession: false } });
    const { data: fopRaw, error: fErr } = await fop.rpc("fn_produtos_para_sncf", {
      p_token: String(token),
      p_colecoes: colecoes,
    });
    if (fErr) throw new Error(`FOP recusou fn_produtos_para_sncf: ${msg(fErr)}`);
    if (!Array.isArray(fopRaw)) throw new Error("fn_produtos_para_sncf não devolveu uma lista");
    const pendMed = (p: Record<string, unknown>) =>
      Array.isArray(p._pendencias_medicao) ? (p._pendencias_medicao as string[]) : [];
    const aguardando = (fopRaw as Record<string, unknown>[]).filter((p) => pendMed(p).length > 0);
    if (soContagem) return json({ ok: true, aguardando_medicao: aguardando.length });
    let fopProdutos = soMedicao ? aguardando : (fopRaw as Record<string, unknown>[]);
    if (cods) fopProdutos = fopProdutos.filter((p) => !vazio(p.cod_cadastro) && cods!.has(String(p.cod_cadastro).trim()));

    const { data: fichaRaw, error: fiErr } = await sb
      .from("produto_ficha_nascimento")
      .select("campo,bloco,dono,ordem,rotulo,importavel_planilha,dim_tabela")
      .order("bloco").order("ordem");
    if (fiErr) throw new Error(`Falha ao ler produto_ficha_nascimento: ${msg(fiErr)}`);
    // 20/10/2026 (Flavio): nome_comercial é bloco 2, mas entra na planilha só para batizar o nascimento; Thomer renomeia no FOP
    const campos_bloco2 = (fichaRaw ?? []).filter((f) => String(f.dono ?? "").trim().toLowerCase() === "thomer" && !SO_NASCIMENTO.has(f.campo))
      .map((f) => ({ campo: f.campo, rotulo: f.rotulo }));
    const ficha: (NonNullable<typeof fichaRaw>[number] & { so_nascimento?: boolean })[] = (fichaRaw ?? [])
      .filter((f) => !BLOCOS_FORA.has(f.bloco) && !CAMPOS_FORA.has(f.campo)
        && (DONOS_PLANILHA.has(String(f.dono ?? "").trim().toLowerCase()) || SO_NASCIMENTO.has(f.campo)))
      .map((f) => SO_NASCIMENTO.has(f.campo)
        ? { ...f, rotulo: "Nome comercial (só para nascimento)", importavel_planilha: false, so_nascimento: true }
        : f);

    const { data: opRaw, error: oErr } = await sb.rpc("fn_ficha_opcoes");
    if (oErr) throw new Error(`Falha em fn_ficha_opcoes: ${msg(oErr)}`);
    const opcoes: Record<string, string[]> = {};
    for (const o of ((opRaw ?? []) as { campo: string; valor: string; ordem: number }[])
      .slice().sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))) {
      (opcoes[o.campo] ??= []).push(o.valor);
    }
    if (ficha.some((f) => f.campo === "grupo_tributario_bling")) opcoes.grupo_tributario_bling = [...GRUPOS_BLING];

    const { data: destinosRaw, error: dErr } = await sb
      .from("vw_produto_campo_destino_planilha")
      .select("campo,destinos");
    if (dErr) throw new Error(`Falha ao ler vw_produto_campo_destino_planilha: ${msg(dErr)}`);
    const destinos_planilha: Record<string, string> = {};
    for (const d of destinosRaw ?? []) if (d.campo && d.destinos) destinos_planilha[d.campo] = d.destinos;

    const skus = [...new Set(fopProdutos.map((p) => p.sku).filter((s) => !vazio(s)).map(String))];
    const espelho = new Map<string, Record<string, unknown>>();
    const inner = new Map<string, number | null>();
    for (let i = 0; i < skus.length; i += 300) {
      const lote = skus.slice(i, i + 300);
      const { data: sp, error: sErr } = await sb.from("sncf_produtos").select("*").in("sku", lote);
      if (sErr) throw new Error(`Falha ao ler sncf_produtos: ${msg(sErr)}`);
      for (const r of sp ?? []) espelho.set(String(r.sku), r);
      const { data: cc, error: cErr } = await sb.from("cartorio_codigo").select("sku,inner_qtd").in("sku", lote);
      if (cErr) throw new Error(`Falha ao ler cartorio_codigo: ${msg(cErr)}`);
      for (const r of cc ?? []) if (r.sku && r.inner_qtd != null) inner.set(String(r.sku), r.inner_qtd);
    }

    // Sugestões "a confirmar": SÓ de produto_sugestao_espelho (abertas).
    const codsExp = [...new Set(fopProdutos.map((p) => p.cod_cadastro).filter((c) => !vazio(c)).map((c) => String(c).trim()))];
    const sugAbertas = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < codsExp.length; i += 300) {
      const { data: sg, error: sgErr } = await sb.from("produto_sugestao_espelho")
        .select("cod_cadastro,campo,valor").eq("resolvida", false).in("cod_cadastro", codsExp.slice(i, i + 300));
      if (sgErr) throw new Error(`Falha ao ler produto_sugestao_espelho: ${msg(sgErr)}`);
      for (const r of sg ?? []) {
        const k = String(r.cod_cadastro).trim();
        (sugAbertas.get(k) ?? sugAbertas.set(k, {}).get(k)!)[r.campo] = r.valor;
      }
    }

    const produtos = fopProdutos.map((p) => {
      const sku = vazio(p.sku) ? "" : String(p.sku);
      const esp = espelho.get(sku) ?? {};
      const sugCod = sugAbertas.get(vazio(p.cod_cadastro) ? "" : String(p.cod_cadastro).trim()) ?? {};
      const valores: Record<string, unknown> = {};
      const sugestoes: Record<string, unknown> = {};
      for (const f of ficha) {
        // nome_operacional, preco_site e grupo_tributario_bling: a fonte é sncf_produtos.
        if (CAMPOS_SNCF.has(f.campo)) {
          if (!vazio(esp[f.campo])) valores[f.campo] = esp[f.campo];
          continue;
        }
        const vFop = p[f.campo];
        if (!vazio(vFop)) { valores[f.campo] = vFop; continue; }
        // Campos que ainda não existem no FOP: espelho é a fonte (não é sugestão).
        if (f.campo === "inner_qtd" && inner.has(sku)) { valores[f.campo] = inner.get(sku); continue; }
        if (!vazio(sugCod[f.campo])) sugestoes[f.campo] = sugCod[f.campo];
      }
      return {
        sku,
        cod_cadastro: vazio(p.cod_cadastro) ? null : String(p.cod_cadastro),
        valores,
        sugestoes,
        fase_atual: p._fase_atual ?? null,
        proxima_fase: p._fase_proxima ?? null,
        pendencias: Array.isArray(p._pendencias_proxima) ? p._pendencias_proxima : [],
        pendencias_medicao: pendMed(p),
      };
    });

    // 20/10/2026 (Flavio): código alocado no cartório é pinável; EAN do pinado vem do cartório.
    // Livre = existe em cartorio_codigo com estado in (estoque, alocado, condicionado) E não é sncf_produtos.
    const codigos_livres: string[] = [];
    if (cods && cods.size) {
      const lista = [...cods];
      for (let i = 0; i < lista.length; i += 500) {
        const { data: lv, error: lErr } = await sb.from("cartorio_codigo").select("cod_cadastro")
          .in("estado", ["estoque", "alocado", "condicionado"]).in("cod_cadastro", lista.slice(i, i + 500));
        if (lErr) throw new Error(`Falha ao ler cartorio_codigo (livres): ${msg(lErr)}`);
        const { data: jp, error: pErr } = await sb.from("sncf_produtos").select("cod_cadastro")
          .in("cod_cadastro", lista.slice(i, i + 500));
        if (pErr) throw new Error(`Falha ao ler sncf_produtos (livres): ${msg(pErr)}`);
        const ja = new Set((jp ?? []).map((x) => String(x.cod_cadastro ?? "").trim()));
        for (const c of lv ?? []) {
          const k = String(c.cod_cadastro ?? "").trim();
          if (k && !ja.has(k)) codigos_livres.push(k);
        }
      }
    }
    return json({ ok: true, ficha, opcoes, destinos_planilha, produtos, campos_bloco2, codigos_livres });
  } catch (e) {
    const m = msg(e);
    console.error("[exportar-planilha-produto] ERRO:", m);
    return json({ ok: false, erro: m }, 500);
  }
});
