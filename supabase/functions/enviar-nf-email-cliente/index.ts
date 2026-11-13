import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { sendResendEmail } from "../_shared/resend-send.ts";

// Mesmo trilho da NF XPM: porta de máquina, anexos do cache e Resend idempotente.
const cors = {
  ...corsHeaders,
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});
const MAX_TENTATIVAS = 8;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return entities[char] ?? char;
});
const conferir = (error: { message: string } | null, contexto: string) => {
  if (error) throw new Error(`${contexto}: ${error.message}`);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const t0 = Date.now();
  const contagem = { processados: 0, enviados: 0, falhas: 0, sem_email: 0, nf_cancelada: 0 };
  const resultado = (ok: boolean, extra: Record<string, unknown> = {}) => ({
    ok, ...contagem, duracao_ms: Date.now() - t0, ...extra,
  });
  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const tokenChamador = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!(serviceKey && tokenChamador === serviceKey)) {
      const cronSecretHeader = req.headers.get("x-cron-secret");
      if (!cronSecretHeader) return json(resultado(false, { error: "Credencial de máquina inválida (x-cron-secret)." }), 403);
      const { data: segredo, error: eSeg } = await sb.rpc("get_vault_secret", { p_name: "SYNC_CRON_SECRET" });
      if (eSeg || !segredo || segredo !== cronSecretHeader) {
        return json(resultado(false, { error: "Credencial de máquina inválida (x-cron-secret)." }), 403);
      }
    }

    const rawBody = await req.text();
    let body: unknown = {};
    try {
      if (rawBody.trim()) body = JSON.parse(rawBody);
    } catch {
      return json(resultado(false, { error: "Body deve ser um JSON válido." }), 400);
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return json(resultado(false, { error: "Body deve ser um objeto com fila_id opcional." }), 400);
    }
    const filaId = (body as Record<string, unknown>).fila_id;
    if (filaId !== undefined && (typeof filaId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(filaId))) {
      return json(resultado(false, { error: "fila_id deve ser um UUID válido." }), 400);
    }

    let q = sb.from("nf_email_cliente_fila")
      .select("id, nf_id, pedido_id, destinatario, tentativas, enfileirado_em");
    if (typeof filaId === "string") q = q.eq("id", filaId);
    else q = q.in("status", ["pendente", "erro"]).lt("tentativas", MAX_TENTATIVAS).order("enfileirado_em").limit(20);
    const { data: itens, error: eFila } = await q;
    conferir(eFila, "ler fila");
    if (!itens?.length) return json(resultado(true));

    for (const item of itens) {
      contagem.processados++;
      const tentativa = (item.tentativas ?? 0) + 1;
      const agora = new Date().toISOString();
      try {
        const { data: nf, error: eNf } = await sb.from("nfs_emitidas")
          .select("id, numero, serie, situacao, xml_storage_path, pdf_storage_path")
          .eq("id", item.nf_id).single();
        conferir(eNf, "ler NF");
        if (!nf) throw new Error("ler NF: não encontrada");
        if (nf.situacao !== "autorizada") {
          const { error } = await sb.from("nf_email_cliente_fila").update({
            status: "nf_cancelada",
            ultimo_erro: `NF em situação '${nf.situacao}' antes do envio — e-mail não enviado.`,
            ultima_tentativa_em: agora,
          }).eq("id", item.id);
          conferir(error, "registrar NF cancelada");
          contagem.nf_cancelada++;
          continue;
        }
        const email = String(item.destinatario ?? "").trim();
        if (!email) {
          const { error } = await sb.from("nf_email_cliente_fila").update({
            status: "sem_email", ultimo_erro: "Cliente sem e-mail.", ultima_tentativa_em: agora,
          }).eq("id", item.id);
          conferir(error, "registrar cliente sem e-mail");
          contagem.sem_email++;
          continue;
        }
        const { data: pedido, error: ePedido } = await sb.from("pedidos")
          .select("id_externo, parceiro_id").eq("id", item.pedido_id).single();
        conferir(ePedido, "ler pedido");
        if (!pedido?.id_externo) throw new Error("Pedido sem referência id_externo.");
        const { data: cliente, error: eCliente } = await sb.from("parceiros_comerciais")
          .select("razao_social").eq("id", pedido.parceiro_id).single();
        conferir(eCliente, "ler cliente");
        if (!cliente) throw new Error("Cliente não encontrado.");

        if (!nf.xml_storage_path || !nf.pdf_storage_path) throw new Error("NF sem XML ou PDF guardado no storage.");
        const { data: xmlBlob, error: eXml } = await sb.storage.from("contabil").download(nf.xml_storage_path);
        if (eXml || !xmlBlob) throw new Error(`baixar XML: ${eXml?.message ?? "vazio"}`);
        const { data: pdfBlob, error: ePdf } = await sb.storage.from("contabil").download(nf.pdf_storage_path);
        if (ePdf || !pdfBlob) throw new Error(`baixar PDF: ${ePdf?.message ?? "vazio"}`);
        const xmlBytes = new Uint8Array(await xmlBlob.arrayBuffer());
        const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());
        const xmlInicio = new TextDecoder().decode(xmlBytes.slice(0, 2000)).replace(/^\uFEFF/, "").trim();
        if (!xmlInicio.startsWith("<") || !(xmlInicio.includes("<nfeProc") || xmlInicio.includes("<NFe"))) {
          throw new Error("O arquivo XML guardado não é XML de NF-e.");
        }
        if (new TextDecoder().decode(pdfBytes.slice(0, 5)) !== "%PDF-") throw new Error("O arquivo PDF guardado não é um PDF válido.");

        const { data: apiKey, error: eKey } = await sb.rpc("get_vault_secret", { p_name: "RESEND_API_KEY" });
        if (eKey || !apiKey) throw new Error(`RESEND_API_KEY ausente no vault${eKey ? `: ${eKey.message}` : ""}`);
        const numero = String(nf.numero ?? "").trim() || "s/n";
        const pedidoRef = String(pedido.id_externo);
        const primeiroNome = String(cliente.razao_social ?? "").trim().split(/\s+/)[0];
        const saudacao = primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!";
        const assunto = `Fetély - Sua nota fiscal - Pedido ${pedidoRef}`;
        const frase = `Obrigado pela sua compra na Fetély. Segue em anexo a nota fiscal nº ${numero} (PDF e XML), referente ao pedido ${pedidoRef}.`;
        const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;line-height:1.5">` +
          `<p>${escapeHtml(saudacao)}</p><p>${escapeHtml(frase)}</p>` +
          `<p style="color:#777;font-size:12px">Mensagem automática — Fetély.</p></div>`;
        const resp = await sendResendEmail({
          apiKey: String(apiKey), to: email, subject: assunto, html,
          text: `${saudacao}\n\n${frase}\n\nMensagem automática — Fetély.`,
          idempotencyKey: `nf-email-cliente-${item.id}`,
          attachments: [
            { filename: `NF_${numero}.pdf`, content: encodeBase64(pdfBytes) },
            { filename: `NF_${numero}.xml`, content: encodeBase64(xmlBytes) },
          ],
        });
        if (!resp?.id) throw new Error("Resend não retornou o id do e-mail enviado.");
        const enviadoEm = new Date().toISOString();
        const { error: eEnviado } = await sb.from("nf_email_cliente_fila").update({
          status: "enviado", tentativas: tentativa, ultimo_erro: null, assunto,
          resend_id: resp.id, enviado_em: enviadoEm, ultima_tentativa_em: agora,
        }).eq("id", item.id);
        conferir(eEnviado, "registrar envio na fila");
        const { error: ePed } = await sb.from("pedidos").update({ nf_email_enviado_em: enviadoEm }).eq("id", item.pedido_id);
        conferir(ePed, "registrar envio no pedido");
        const { error: eLog } = await sb.from("email_send_log").insert({
          message_id: resp.id, template_name: "nf-cliente-balcao", recipient_email: email, status: "sent",
          metadata: { fila_id: item.id, nf_id: nf.id, nf_numero: numero, pedido: pedidoRef },
        });
        conferir(eLog, "email_send_log");
        const { error: eEvento } = await sb.from("pedido_eventos").insert({
          pedido_id: item.pedido_id, tipo_evento: "outro",
          descricao: `NF ${numero} enviada por e-mail ao cliente (${email})`, automatico: true,
          metadata: { origem: "enviar-nf-email-cliente", fila_id: item.id, resend_id: resp.id },
        });
        conferir(eEvento, "registrar evento do pedido");
        contagem.enviados++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[enviar-nf-email-cliente] falha", { fila_id: item.id, nf_id: item.nf_id, erro: msg });
        contagem.falhas++;
        const { error: eErro } = await sb.from("nf_email_cliente_fila").update({
          status: "erro", tentativas: tentativa, ultimo_erro: msg, ultima_tentativa_em: agora,
        }).eq("id", item.id);
        conferir(eErro, "registrar falha na fila");
        if (tentativa >= MAX_TENTATIVAS && item.pedido_id) {
          const { error: eEvento } = await sb.from("pedido_eventos").insert({
            pedido_id: item.pedido_id, tipo_evento: "erro_automacao", automatico: true,
            descricao: `O e-mail da NF ao cliente não saiu após 8 tentativas. Último erro: ${msg}`,
            metadata: { erro_origem: "enviar-nf-email-cliente", fila_id: item.id, nf_id: item.nf_id },
          });
          conferir(eEvento, "registrar limite de tentativas");
        }
      }
    }
    return json(resultado(true));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[enviar-nf-email-cliente] erro geral", msg);
    return json(resultado(false, { erro: msg }), 500);
  }
});