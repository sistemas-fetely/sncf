// Pacote do Contador v2: envia as partes do ZIP pronto para a pasta do contador no Google Drive,
// através da ponte (Web App do Apps Script). Fail-loud: qualquer parte com erro falha a chamada inteira.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { BUCKET } from "../_shared/pacote-contador/remessa.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const msg = (e: unknown) => e instanceof Error ? e.message : (e && typeof e === "object" && "message" in e ? String((e as any).message) : String(e));

type ArquivoDrive = { nome: string; id: string; url: string; bytes: number; ja_existia: boolean };

async function segredo(admin: any, nome: string): Promise<string | null> {
  const { data, error } = await admin.rpc("get_vault_secret", { p_name: nome });
  if (error) throw new Error(`Falha ao ler ${nome}: ${error.message}`);
  return typeof data === "string" && data.trim() ? data.trim() : null;
}

/** POST na ponte; o Apps Script responde 302 e o fetch segue até o JSON final. */
async function chamarPonte(url: string, corpo: Record<string, unknown>): Promise<any> {
  const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo), redirect: "follow" });
  const texto = await resp.text();
  let r: any;
  try { r = JSON.parse(texto); } catch { throw new Error(`Ponte do Drive respondeu algo que não é JSON (HTTP ${resp.status}): ${texto.slice(0, 200)}`); }
  if (!r?.ok) throw new Error(`Ponte do Drive: ${r?.erro ?? `falha sem mensagem (HTTP ${resp.status})`}`);
  return r;
}

export function nomeArquivoDrive(competencia: string, versao: number, indice: number, total: number): string {
  const [aaaa, mm] = String(competencia).slice(0, 7).split("-");
  return `Fetely_${aaaa}_${mm}_v${versao}${total > 1 ? `_p${indice}` : ""}.zip`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, erro: "Use POST" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ ok: false, erro: "Não autorizado" }, 401);
  const userDb = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: claims } = await userDb.auth.getClaims(auth.slice(7));
  const uid = claims?.claims?.sub;
  if (!uid) return json({ ok: false, erro: "Sessão inválida" }, 401);
  const { data: pode, error: pe } = await userDb.rpc("pode_ler_tabela", { p_tabela: "remessas_contador" });
  if (pe) return json({ ok: false, erro: pe.message }, 500);
  if (!pode) return json({ ok: false, erro: "Sem permissão para o pacote do contador" }, 403);
  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, erro: "JSON inválido" }, 400); }
  const teste = body?.teste === true;
  const id = String(body?.remessa_id ?? "");
  if (!teste && !/^[0-9a-f-]{36}$/i.test(id)) return json({ ok: false, erro: "remessa_id inválido" }, 400);
  try {
    const admin = createClient(url, service);
    const ponteUrl = await segredo(admin, "DRIVE_PONTE_URL");
    const token = await segredo(admin, "DRIVE_PONTE_TOKEN");
    if (!ponteUrl || !token) throw new Error("Ponte do Drive não configurada");

    if (teste) {
      const r = await chamarPonte(ponteUrl, { token, teste: true });
      return json({ ok: true, pasta: r.pasta ?? null, url: r.url ?? null });
    }

    const { data: rem, error } = await admin.from("remessas_contador").select("id, status, competencia, versao, partes").eq("id", id).single();
    if (error) throw error;
    if (rem.status !== "pronto") throw new Error(`Remessa em '${rem.status ?? "formato antigo"}' — só pacotes prontos vão ao Drive.`);
    const partes: any[] = [...(rem.partes ?? [])].sort((a, b) => a.indice - b.indice);
    if (!partes.length) throw new Error("Remessa sem partes gravadas.");

    const arquivos: ArquivoDrive[] = [];
    for (let i = 0; i < partes.length; i++) {
      const nome = nomeArquivoDrive(rem.competencia, rem.versao, i + 1, partes.length);
      const { data: blob, error: de } = await admin.storage.from(BUCKET).download(partes[i].path);
      if (de || !blob) throw new Error(`Falha ao baixar ${partes[i].path}: ${de?.message ?? "arquivo vazio"}`);
      const base64 = encodeBase64(new Uint8Array(await blob.arrayBuffer()));
      const r = await chamarPonte(ponteUrl, { token, nome, base64 });
      arquivos.push({ nome, id: String(r.id ?? ""), url: String(r.url ?? ""), bytes: Number(r.bytes ?? 0), ja_existia: r.ja_existia === true });
    }

    const { error: ue } = await admin.from("remessas_contador")
      .update({ drive_enviado_em: new Date().toISOString(), drive_enviado_por: uid, drive_arquivos: arquivos })
      .eq("id", id);
    if (ue) throw ue;
    return json({ ok: true, arquivos });
  } catch (e) { return json({ ok: false, erro: msg(e) }, 500); }
});
