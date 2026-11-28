// DEVOLUÇÃO → NF À XPM (28/11/2026). A XPM só emite o termo de devolução depois de receber a NF de devolução.
// POST {devolucao_id}: usuário com tela.devolucoes. Busca XML + PDF da NF de devolução no Bling, valida,
// envia pelo trilho único do Resend aos destinatários de devolucao_email_xpm_destinatario e registra
// o envio em devolucao_nf_email_xpm + andamento do caso (F-POP-006). Reenvio é permitido (log novo).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";
import { baixarPdfValidado, validarXmlNf } from "../_shared/bling/nf-anexo.ts";
import { sendResendEmail } from "../_shared/resend-send.ts";

// deno-lint-ignore-file no-explicit-any
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const msg = (e: unknown) => e instanceof Error ? e.message : (e && typeof e === "object" && "message" in e ? String((e as any).message) : String(e));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const Corpo = z.object({ devolucao_id: z.string().uuid() });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, erro: "Use POST" }, 405);
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ ok: false, erro: "Não autorizado" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const jwt = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: claims, error: ea } = await jwt.auth.getClaims(auth.slice(7));
  const userId = claims?.claims?.sub as string | undefined;
  if (ea || !userId) return json({ ok: false, erro: "Não autorizado" }, 401);
  const { data: permitido, error: ep } = await jwt.rpc("tem_permissao", { p_slug: "tela.devolucoes", p_user: userId });
  if (ep) return json({ ok: false, erro: ep.message }, 500);
  if (!permitido) return json({ ok: false, erro: "Sem permissão para devoluções" }, 403);

  const p = Corpo.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return json({ ok: false, erro: "devolucao_id inválido" }, 400);
  const devId = p.data.devolucao_id;
  const db = createClient(url, service);

  const { data: perfil } = await db.from("profiles").select("full_name").eq("user_id", userId).maybeSingle();
  const nomeUsuario = (perfil as any)?.full_name || (claims?.claims?.email as string) || null;

  // Validações — nada sai sem caso XPM com NF autorizada.
  const { data: dev, error: ed } = await db.from("devolucao")
    .select("id,numero,pedido_id,nf_dev_status,nf_dev_bling_id,nf_dev_numero,nf_devolucao,nf_original_id,rastreio_reverso").eq("id", devId).maybeSingle();
  if (ed) return json({ ok: false, erro: `ler devolução: ${ed.message}` }, 500);
  if (!dev) return json({ ok: false, erro: "Devolução não encontrada." }, 404);
  const { data: fun, error: ef } = await db.from("vw_devolucao_funil").select("destino_codigo,pedido_ref,cliente,rastreio_efetivo").eq("id", devId).maybeSingle();
  if (ef) return json({ ok: false, erro: `ler funil: ${ef.message}` }, 500);
  if (!String(fun?.destino_codigo ?? "").startsWith("XPM")) return json({ ok: false, erro: `O destino desta devolução não é a XPM (${fun?.destino_codigo ?? "sem destino"}).` }, 400);
  if (dev.nf_dev_status !== "autorizada" || !dev.nf_dev_bling_id) return json({ ok: false, erro: "A NF de devolução ainda não está autorizada no Bling." }, 400);

  const { data: dests, error: edst } = await db.from("devolucao_email_xpm_destinatario").select("email,papel").eq("ativo", true).order("ordem");
  if (edst) return json({ ok: false, erro: `ler destinatários: ${edst.message}` }, 500);
  const para = (dests ?? []).filter((d: any) => d.papel === "para").map((d: any) => d.email as string);
  const copia = (dests ?? []).filter((d: any) => d.papel === "copia").map((d: any) => d.email as string);
  if (!para.length) return json({ ok: false, erro: "Nenhum destinatário 'para' ativo da XPM cadastrado." }, 400);

  let nfOriginal: string | null = null;
  if (dev.nf_original_id) {
    const { data: nfo, error: eo } = await db.from("nfs_emitidas").select("numero").eq("id", dev.nf_original_id).maybeSingle();
    if (eo) return json({ ok: false, erro: `ler NF de venda: ${eo.message}` }, 500);
    nfOriginal = nfo?.numero ?? null;
  }
  const nfNum = String(dev.nf_dev_numero ?? "");
  const pedidoRef = fun?.pedido_ref ?? "—";
  const rastreio = fun?.rastreio_efetivo || dev.rastreio_reverso || null;
  const assunto = `[Fetely] - NF de Devolução - Pedido ${pedidoRef} - ${dev.numero}`;

  // Log primeiro: o id dele é a chave de idempotência (reenvio consciente = log novo).
  const { data: log, error: el } = await db.from("devolucao_nf_email_xpm").insert({
    devolucao_id: devId, nf_numero: nfNum || null, nf_chave: dev.nf_devolucao ?? null, assunto, para, copia,
    status: "erro", erro: "envio em andamento", enviado_por: userId, enviado_por_nome: nomeUsuario,
  }).select("id").single();
  if (el) return json({ ok: false, erro: `registrar envio: ${el.message}` }, 500);

  try {
    const { data: cfg, error: ec } = await db.from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle();
    if (ec) throw ec;
    if (!cfg?.access_token) throw new Error("Bling não conectado.");
    const bling = makeBlingClient(db, cfg, await ensureFreshToken(db, cfg));
    const nfe = (await bling.get(`/nfe/${dev.nf_dev_bling_id}`))?.data ?? {};
    const linkPdf = nfe.linkPDF ?? nfe.linkDanfe;
    const linkXml = nfe.xml;
    if (!linkPdf) throw new Error("O Bling não devolveu o link do PDF da NF de devolução.");
    if (!linkXml) throw new Error("O Bling não devolveu o link do XML da NF de devolução.");
    const pdf = await baixarPdfValidado(linkPdf, "bling_fresco", { devolucao_id: devId });
    const rx = await fetch(linkXml);
    if (!rx.ok) throw new Error(`download do XML ${rx.status}`);
    const xml = validarXmlNf(await rx.text(), { devolucao_id: devId });

    const { data: apiKey, error: ek } = await db.rpc("get_vault_secret", { p_name: "RESEND_API_KEY" });
    if (ek || !apiKey) throw new Error("RESEND_API_KEY ausente no cofre.");
    const frase = `segue em anexo a NF de devolução nº ${nfNum} (XML e PDF), referente ao retorno do pedido ${pedidoRef} (${fun?.cliente ?? "—"}), NF de venda nº ${nfOriginal ?? "—"}${rastreio ? `, rastreio ${rastreio}` : ""}.`;
    const pedido = "Por favor, enviem o termo de devolução deste retorno para termo@xpm.fetelycorp.com.br.";
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;line-height:1.5">` +
      `<p>Olá, ${esc(frase)}</p><p>${esc(pedido)}</p><p style="color:#777;font-size:12px">Mensagem automática — Fetely.</p></div>`;
    const text = `Olá, ${frase}\n\n${pedido}\n\nMensagem automática — Fetely.`;
    // sendResendEmail aceita um 'to'; os demais 'para' seguem em cópia junto com os de cópia.
    const resp = await sendResendEmail({
      apiKey: String(apiKey), to: para[0], cc: [...para.slice(1), ...copia], subject: assunto, html, text,
      idempotencyKey: `dev-nf-xpm-${log.id}`,
      attachments: [
        { filename: `NF_${nfNum}.xml`, content: encodeBase64(new TextEncoder().encode(xml)) },
        { filename: `NF_${nfNum}.pdf`, content: encodeBase64(pdf) },
      ],
    });
    const agora = new Date().toISOString();
    const { error: eu } = await db.from("devolucao_nf_email_xpm").update({ status: "enviado", erro: null, resend_id: resp?.id ?? null, criado_em: agora }).eq("id", log.id);
    if (eu) console.error(`[devolucao-enviar-nf-xpm] gravar sucesso: ${eu.message}`);

    const { data: proc } = await db.from("processos").select("id").eq("codigo", "F-POP-006").maybeSingle();
    const { data: retomar } = await db.rpc("fn_dia_util_add", { p_data: agora.slice(0, 10), p_dias: 3 });
    if (proc?.id) {
      const { error: ean } = await db.from("processo_caso_andamento").insert({
        processo_id: proc.id, caso_tipo: "devolucao", caso_id: devId, caso_ref: dev.numero, pedido_id: dev.pedido_id, devolucao_id: devId,
        autor_user_id: userId, autor_nome: nomeUsuario,
        texto: `NF de devolução ${nfNum} enviada à XPM (${para.join(", ")}${copia.length ? `; cópia ${copia.join(", ")}` : ""}) — aguardando o termo.`,
        retomar_em: retomar ?? null,
      });
      if (ean) console.error(`[devolucao-enviar-nf-xpm] andamento: ${ean.message}`);
    } else console.error("[devolucao-enviar-nf-xpm] processo F-POP-006 não encontrado; andamento não registrado");
    console.log(`[devolucao-enviar-nf-xpm] ${dev.numero} NF ${nfNum} enviada para ${para.join(",")}`);
    return json({ ok: true, enviado_em: agora, para, copia });
  } catch (e) {
    const m = msg(e).slice(0, 500);
    await db.from("devolucao_nf_email_xpm").update({ status: "erro", erro: m }).eq("id", log.id);
    console.error(`[devolucao-enviar-nf-xpm] ${dev.numero}: ${m}`);
    return json({ ok: false, erro: m }, 502);
  }
});
