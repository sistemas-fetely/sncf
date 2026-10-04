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
    const ficha = (fichaRaw ?? []).filter((f) => !BLOCOS_FORA.has(f.bloco) && !CAMPOS_FORA.has(f.campo));

    const { data: opRaw, error: oErr } = await sb.rpc("fn_ficha_opcoes");
    if (oErr) throw new Error(`Falha em fn_ficha_opcoes: ${msg(oErr)}`);
    const opcoes: Record<string, string[]> = {};
    for (const o of ((opRaw ?? []) as { campo: string; valor: string; ordem: number }[])
      .slice().sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))) {
      (opcoes[o.campo] ??= []).push(o.valor);
    }

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

    const produtos = fopProdutos.map((p) => {
      const sku = vazio(p.sku) ? "" : String(p.sku);
      const esp = espelho.get(sku) ?? {};
      const valores: Record<string, unknown> = {};
      const sugestoes: Record<string, unknown> = {};
      for (const f of ficha) {
        const vFop = p[f.campo];
        if (!vazio(vFop)) { valores[f.campo] = vFop; continue; }
        // Campos que ainda não existem no FOP: espelho é a fonte (não é sugestão).
        if (f.campo === "nome_operacional" && !vazio(esp.nome_operacional)) { valores[f.campo] = esp.nome_operacional; continue; }
        if (f.campo === "inner_qtd" && inner.has(sku)) { valores[f.campo] = inner.get(sku); continue; }
        const vEsp = esp[f.campo];
        if (!vazio(vEsp)) sugestoes[f.campo] = vEsp;
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

    return json({ ok: true, ficha, opcoes, produtos });
  } catch (e) {
    const m = msg(e);
    console.error("[exportar-planilha-produto] ERRO:", m);
    return json({ ok: false, erro: m }, 500);
  }
});
