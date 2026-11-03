// Mercado Pago — relatórios (Fase 1). Etapa atual: só leitura (sondar / testar_csv).
// Token mp_access_token lido do Vault por service_role. Nunca devolve o token. Nunca faz PUT/POST de config.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import * as XLSX from "npm:xlsx@0.18.5";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const MP = "https://api.mercadopago.com/v1/account";
const TIPOS = { release: "release_report", settlement: "settlement_report" } as const;
type Tipo = keyof typeof TIPOS;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const auth = req.headers.get("Authorization") ?? "";
  const { data: u } = await db.auth.getUser(auth.replace("Bearer ", ""));
  if (!u?.user) return json({ ok: false, erro: "Não autorizado" }, 401);
  const { data: pode, error: pe } = await db.rpc("usuario_tem_acao", { p_slug: "acao.credenciais_integracao.gravar", p_user_id: u.user.id });
  if (pe) return json({ ok: false, erro: `Falha ao checar permissão: ${pe.message}` }, 500);
  if (!pode) return json({ ok: false, erro: "Sem permissão (acao.credenciais_integracao.gravar)" }, 403);

  const { data: token, error: te } = await db.rpc("get_vault_secret", { p_name: "mp_access_token" });
  if (te) return json({ ok: false, erro: `Falha ao ler o cofre: ${te.message}` }, 500);
  if (!token) return json({ ok: false, erro: "credencial mp_access_token não cadastrada" }, 400);
  const tok = String(token);
  const limpa = (s: string) => s.replaceAll(tok, "***");
  const get = async (path: string) => {
    const r = await fetch(`${MP}/${path}`, { headers: { Authorization: `Bearer ${tok}` } });
    return { status: r.status, texto: limpa(await r.text()) };
  };

  const body = await req.json().catch(() => ({}));
  const acao = String(body?.acao ?? "sondar");

  if (acao === "sondar") {
    const out: Record<string, unknown> = {};
    for (const t of Object.keys(TIPOS) as Tipo[]) {
      const cfg = await get(`${TIPOS[t]}/config`);
      const lst = await get(`${TIPOS[t]}/list`);
      let lista: unknown = lst.texto.slice(0, 400);
      try {
        const arr = JSON.parse(lst.texto);
        if (Array.isArray(arr)) {
          lista = { total: arr.length, recentes: [...arr].sort((a: any, b: any) => String(b.begin_date).localeCompare(String(a.begin_date))).slice(0, 12).map((x: any) => ({
            file_name: x.file_name, begin_date: x.begin_date, end_date: x.end_date,
            created_from: x.created_from, status: x.status, id: x.id, date_created: x.date_created,
          })) };
        }
      } catch { /* fica o texto */ }
      out[t] = { config_status: cfg.status, config: cfg.texto.slice(0, 1500), list_status: lst.status, lista };
    }
    return json({ ok: true, ...out });
  }

  if (acao === "testar_xlsx") {
    const tipo = String(body?.tipo) as Tipo;
    const fn = String(body?.file_name ?? "");
    if (!(tipo in TIPOS) || !/^[\w.\-]+$/.test(fn)) return json({ ok: false, erro: "tipo e file_name obrigatórios" }, 400);
    const r = await fetch(`${MP}/${TIPOS[tipo]}/${encodeURIComponent(fn)}`, { headers: { Authorization: `Bearer ${tok}` } });
    if (!r.ok) return json({ ok: false, status: r.status, corpo: limpa(await r.text()).slice(0, 500) });
    const buf = await r.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false }) as unknown[][];
    return json({ ok: true, status: r.status, bytes: buf.byteLength, abas: wb.SheetNames, total_linhas: rows.length,
      cabecalho: rows[0], amostra: rows.slice(1, 3), ultimas: rows.slice(-2) });
  }

  if (acao === "testar_csv") {
    const tipo = String(body?.tipo) as Tipo;
    const fn = String(body?.file_name ?? "");
    if (!(tipo in TIPOS) || !/^[\w.\-]+$/.test(fn)) return json({ ok: false, erro: "tipo e file_name obrigatórios" }, 400);
    const r = await get(`${TIPOS[tipo]}/${encodeURIComponent(fn)}`);
    const linhas = r.texto.split(/\r?\n/);
    return json({ ok: r.status === 200, status: r.status, bytes: r.texto.length, total_linhas: linhas.length,
      cabecalho: linhas[0]?.slice(0, 1500), amostra: linhas.slice(1, 4).map((l) => l.slice(0, 600)),
      ultimas: linhas.slice(-3).map((l) => l.slice(0, 300)) });
  }

  return json({ ok: false, erro: `ação desconhecida: ${acao}` }, 400);
});
