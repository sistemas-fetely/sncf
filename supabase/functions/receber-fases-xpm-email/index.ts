// receber-fases-xpm-email — 24/10/2026 (OK Flavio)
// Ingestão AUTOMÁTICA do relatório de fases da XPM (FastVision, 2x/dia).
// Caminho: Locaweb logistica.corp@ (filtro remetente noreply@xpmlogistica…)
//   -> cópia para fases@xpm.fetelycorp.com.br -> Resend inbound (MX xpm.)
//   -> webhook email.received -> ESTA função -> fn_ingerir_fases_arquivo_xpm.
// Parser = porta fiel do parsearEmail de src/pages/vendas/xpm/ImportarFasesXpm.tsx,
// com UMA correção: datas do arquivo são horário de Brasília (-03:00). No browser
// o new Date(local) acertava por acaso; no Deno (UTC) atrasaria 3h.
// Fail-loud: todo recebimento vira linha em xpm_fases_email_log (com erro, se houver).
// Idempotente: resend_email_id único — retry do Resend não duplica ingestão.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.48/deno-dom-wasm.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, "março": 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};
const COLUNAS = ["PEDIDO", "STATUSNF", "IMPORTADOEM", "SEPARADOEM", "CONFERIDOEM", "FATURADOEM"] as const;
type Coluna = (typeof COLUNAS)[number];

const pad = (n: number | string) => String(n).padStart(2, "0");
// monta ISO com offset de Brasília
const isoBR = (a: string | number, mo: string | number, d: string | number, h: string | number, mi: string | number, s: string | number = 0) =>
  `${a}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(s)}-03:00`;

function normCabecalho(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// "yyyy-MM-dd HH:mm[:ss]" -> ISO -03:00 ; "" vazio ; null formato desconhecido
function dataCelulaParaIso(v: string): string | null {
  const s = v.trim();
  if (!s) return "";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return isoBR(m[1], m[2], m[3], m[4], m[5], m[6] ?? 0);
}

function extrairGeradoEm(texto: string): string | null {
  const m = texto.match(
    /data\s*de\s*gera[çc][ãa]o\s*:?\s*(\d{1,2})\s+de\s+([a-zçáéíóúâêôãõ]+)\s+de\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/i,
  );
  if (!m) return null;
  const mes = MESES[m[2].toLowerCase()];
  if (!mes) return null;
  return isoBR(m[3], mes, m[1], m[4], m[5], m[6]);
}

function extrairNumeroEnvio(texto: string): string | null {
  const m = texto.match(/n[úu]mero\s*de\s*envio\s*:?\s*(\d+)/i);
  return m ? m[1] : null;
}

// 24/10/2026: "Data de geração" vem em 12h sem AM/PM. A hora do assunto ("... - 17:00") desempata.
function corrigirMeioDia(geradoIso: string | null, assunto: string): string | null {
  if (!geradoIso) return geradoIso;
  const m = assunto.match(/-\s*(\d{1,2}):(\d{2})\s*$/);
  if (!m) return geradoIso;
  const horaAssunto = +m[1];
  const horaGerado = +geradoIso.slice(11, 13);
  if (horaAssunto >= 12 && horaGerado < 12) {
    return geradoIso.slice(0, 11) + String(horaGerado + 12).padStart(2, "0") + geradoIso.slice(13);
  }
  return geradoIso;
}

function parsearEmail(html: string): { linhas: Record<string, string>[]; geradoEm: string | null; numeroEnvio: string | null; datasInvalidas: number; erro: string | null } {

  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return { linhas: [], geradoEm: null, numeroEnvio: null, datasInvalidas: 0, erro: "HTML ilegível." };
  const textoPlano = (doc.body?.textContent ?? html).replace(/\s+/g, " ");
  const geradoEm = extrairGeradoEm(textoPlano);
  const numeroEnvio = extrairNumeroEnvio(textoPlano);

  // deno-lint-ignore no-explicit-any
  let tabela: any = null;
  let mapa: Partial<Record<Coluna, number>> = {};
  for (const t of Array.from(doc.querySelectorAll("table"))) {
    // deno-lint-ignore no-explicit-any
    const tr = (t as any).querySelector("tr");
    if (!tr) continue;
    // deno-lint-ignore no-explicit-any
    const cels = Array.from(tr.querySelectorAll("th,td")).map((c: any) => normCabecalho(c.textContent ?? ""));
    if (!cels.includes("PEDIDO") || !cels.includes("STATUSNF")) continue;
    const m: Partial<Record<Coluna, number>> = {};
    COLUNAS.forEach((col) => { const i = cels.indexOf(col); if (i >= 0) m[col] = i; });
    tabela = t; mapa = m;
    break;
  }
  if (!tabela) return { linhas: [], geradoEm, numeroEnvio, datasInvalidas: 0, erro: "Nenhuma tabela com PEDIDO/STATUSNF no HTML." };
  const faltantes = COLUNAS.filter((c) => mapa[c] === undefined);
  if (faltantes.length) return { linhas: [], geradoEm, numeroEnvio, datasInvalidas: 0, erro: `Colunas faltantes: ${faltantes.join(", ")}` };

  const linhas: Record<string, string>[] = [];
  let datasInvalidas = 0;
  // deno-lint-ignore no-explicit-any
  const cel = (cels: any, col: Coluna) => (cels[mapa[col]!]?.textContent ?? "").trim();
  for (const tr of Array.from(tabela.querySelectorAll("tr"))) {
    // deno-lint-ignore no-explicit-any
    const cels = (tr as any).querySelectorAll("th,td");
    if (!cels.length) continue;
    if (normCabecalho(cels[0]?.textContent ?? "") === "PEDIDO") continue;
    const pedido = cel(cels, "PEDIDO");
    if (!pedido) continue;
    const linha: Record<string, string> = { pedido, statusnf: cel(cels, "STATUSNF") };
    for (const col of ["IMPORTADOEM", "SEPARADOEM", "CONFERIDOEM", "FATURADOEM"] as const) {
      const iso = dataCelulaParaIso(cel(cels, col));
      if (iso === null) { datasInvalidas++; linha[col.toLowerCase()] = ""; }
      else linha[col.toLowerCase()] = iso;
    }
    linhas.push(linha);
  }
  return { linhas, geradoEm, numeroEnvio, datasInvalidas, erro: null as string | null };
}

// Assinatura Svix (padrão do Resend): HMAC-SHA256 de `${id}.${timestamp}.${body}`
// com a chave base64 após "whsec_". Header svix-signature: "v1,<b64> v1,<b64>".
async function assinaturaValida(secret: string, id: string, ts: string, body: string, header: string): Promise<boolean> {
  if (!secret || !id || !ts || !header) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // replay > 5 min
  const chave = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), (c) => c.charCodeAt(0));
  const k = await crypto.subtle.importKey("raw", chave, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${id}.${ts}.${body}`)));
  const esperado = btoa(String.fromCharCode(...sig));
  return header.split(" ").some((p) => p.split(",")[1] === esperado);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "método" }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const corpo = await req.text();

  const { data: segredo } = await sb.rpc("get_vault_secret", { p_name: "RESEND_WEBHOOK_SECRET_FASES_XPM" });
  const ok = await assinaturaValida(
    String(segredo ?? ""),
    req.headers.get("svix-id") ?? "",
    req.headers.get("svix-timestamp") ?? "",
    corpo,
    req.headers.get("svix-signature") ?? "",
  );
  if (!ok) return json({ error: "assinatura inválida" }, 401);

  // deno-lint-ignore no-explicit-any
  let evento: any;
  try { evento = JSON.parse(corpo); } catch { return json({ error: "json" }, 400); }
  if (evento?.type !== "email.received") return json({ ignorado: evento?.type ?? null });

  const emailId: string = evento?.data?.email_id ?? evento?.data?.id ?? "";
  if (!emailId) return json({ error: "sem email_id" }, 400);

  // 29/10/2026 — F1 Faturamento: e-mail para faturas@ vai para importar-fatura-xpm (sem parser de fases, sem log de fases)
  {
    const { data: rk } = await sb.rpc("get_vault_secret", { p_name: "resend_api_key" });
    // deno-lint-ignore no-explicit-any
    let destinos: any[] = Array.isArray(evento?.data?.to) ? evento.data.to : [];
    if (!destinos.length) {
      const r = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, { headers: { Authorization: `Bearer ${rk}` } });
      if (!r.ok) return json({ error: `Resend GET ${r.status}` }, 500);
      const em = await r.json();
      destinos = Array.isArray(em?.to) ? em.to : em?.to ? [em.to] : [];
    }
    const ehFatura = destinos.some((d) => {
      const s = String(d ?? "").toLowerCase();
      const m = s.match(/<([^>]+)>/);
      return (m ? m[1] : s).trim().startsWith("faturas@");
    });
    if (ehFatura) {
      const { data: ik } = await sb.rpc("get_vault_secret", { p_name: "INTERNAL_EDGE_KEY" });
      const chaveInterna = String(ik ?? "") || String(rk ?? "");
      const rf = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/importar-fatura-xpm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-key": chaveInterna },
        body: JSON.stringify({ resend_email_id: emailId }),
      });
      const txt = await rf.text();
      console.log(`importar-fatura-xpm ${rf.status}: ${txt.slice(0, 500)}`);
      return json({ encaminhado: "faturas", status_importacao: rf.status });
    }
  }

  // idempotência: já processado com sucesso -> 200 sem refazer
  const { data: ja } = await sb.from("xpm_fases_email_log").select("id, erro").eq("resend_email_id", emailId).maybeSingle();
  if (ja && !ja.erro) return json({ duplicado: true });

  const log: Record<string, unknown> = { resend_email_id: emailId, recebido_em: new Date().toISOString() };
  try {
    const { data: chave } = await sb.rpc("get_vault_secret", { p_name: "resend_api_key" });
    const r = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: { Authorization: `Bearer ${chave}` },
    });
    if (!r.ok) throw new Error(`Resend GET ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const email = await r.json();
    log.remetente = email.from ?? null;
    log.assunto = email.subject ?? null;

    const p = parsearEmail(String(email.html ?? ""));
    p.geradoEm = corrigirMeioDia(p.geradoEm, String(email.subject ?? ""));
    log.arquivo_gerado_em = p.geradoEm;

    log.arquivo_numero_envio = p.numeroEnvio;
    log.linhas_lidas = p.linhas.length;
    log.datas_invalidas = p.datasInvalidas;

    if (p.erro) {
      // e-mail sem a tabela de fases (outro tipo de aviso da XPM): registra e encerra sem erro
      log.resultado = { ignorado: p.erro };
    } else if (!p.geradoEm) {
      throw new Error('Cabeçalho "Data de geração" não encontrado.');
    } else if (p.linhas.length === 0) {
      throw new Error("Tabela encontrada sem linhas de pedido.");
    } else {
      const { data, error } = await sb.rpc("fn_ingerir_fases_arquivo_xpm", {
        p_linhas: p.linhas,
        p_arquivo_gerado_em: p.geradoEm,
        p_arquivo_numero_envio: p.numeroEnvio,
      });
      if (error) throw new Error(`fn_ingerir_fases_arquivo_xpm: ${error.message}`);
      log.resultado = data;
    }
    log.erro = null;
  } catch (e) {
    log.erro = e instanceof Error ? e.message : String(e);
  }

  await sb.from("xpm_fases_email_log").upsert(log, { onConflict: "resend_email_id" });
  // erro -> 500 para o Resend tentar de novo; o log já registrou
  return json({ ok: !log.erro, erro: log.erro ?? null }, log.erro ? 500 : 200);
});
