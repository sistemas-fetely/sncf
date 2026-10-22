// TEMPORÁRIO — remover após uso.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { BlingHttpError, ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";
// deno-lint-ignore-file no-explicit-any
const DEV = "8648383a-f161-453c-b0fa-7760e73b8612";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = req.headers.get("Authorization") ?? "";
  const jwt = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: cl } = await jwt.auth.getClaims(auth.slice(7));
  const uid = cl?.claims?.sub;
  if (!uid) return json({ erro: "401" }, 401);
  const { data: ok } = await jwt.rpc("tem_permissao", { p_slug: "tela.devolucoes", p_user: uid });
  if (!ok) return json({ erro: "403" }, 403);
  const db = createClient(url, service);
  const { data: cfg } = await db.from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle();
  const bling = makeBlingClient(db, cfg, await ensureFreshToken(db, cfg));
  const { data: d, error } = await db.rpc("fn_devolucao_dados_nf", { p_devolucao_id: DEV });
  if (error) return json({ erro: error.message }, 500);
  const agora = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date()).replace(",", "");
  const base = () => ({
    tipo: 0, finalidade: d.finalidade ?? 5, dataOperacao: agora, contato: d.destinatario,
    naturezaOperacao: { id: d.natureza_bling_id },
    documentoReferenciado: { modelo: "55", chaveAcesso: d.nf_origem_chave },
    itens: d.itens.map((i: any) => ({ codigo: i.sku, descricao: i.descricao, unidade: i.unidade || "UN", quantidade: i.quantidade, valor: i.valor, tipo: "P", classificacaoFiscal: i.ncm, origem: i.origem })),
    parcelas: [], transporte: { fretePorConta: 9 },
    observacoes: `Nota de crédito (redução de valores ou quantidades) referente à NF-e ${d.nf_origem_numero} (chave ${d.nf_origem_chave}). Justificativa: ${d.justificativa}. ${d.devolucao_numero} — SNCF.`,
    informacoesAdicionaisFisco: `Justificativa: ${d.justificativa}`,
  } as Record<string, any>);
  const variantes: Array<[string, any]> = [["a tipoNota:'04'", "04"], ["b tipoNota:4", 4], ["c tipoNota:'4'", "4"]];
  const res: any[] = [];
  for (const [nome, v] of variantes) {
    try {
      const r = await bling.post("/nfe", { ...base(), tipoNota: v }, { retry: false });
      const id = Number(r?.data?.id); const numero = r?.data?.numero ? String(r.data.numero) : null;
      const { error: e } = await db.rpc("fn_devolucao_nf_registrar", { p_devolucao_id: DEV, p_status: "rascunho", p_bling_id: id, p_numero: numero, p_erro: null, p_chave: null });
      res.push({ nome, criada: true, id, numero, registro_erro: e?.message ?? null, alertas: r?.data?.alertas ?? null });
      break;
    } catch (e: any) {
      res.push({ nome, criada: false, status: e?.status, corpo: e instanceof BlingHttpError ? e.corpo : String(e?.message ?? e) });
      if (!(e instanceof BlingHttpError) || e.status >= 500 || e.status === 429) break; // incerto: não repetir
    }
  }
  return json({ resultados: res });
});
