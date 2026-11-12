import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { sendResendEmail } from "../_shared/resend-send.ts";

// E-MAIL DE NF DE SAÍDA PARA A XPM (12/11/2026, OK Flavio).
// Lê nf_email_xpm_fila, anexa XML + PDF guardados no storage e envia pelo
// trilho único do Resend. 1 linha na fila = 1 e-mail por NF.
// Chamador: cron (x-cron-secret) ou service role. Não há chamador humano.

const cors = {
  ...corsHeaders,
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const MAX_TENTATIVAS = 8;
const ESPERA_VINCULO_PEDIDO_MIN = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const t0 = Date.now();
  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    const body = await req.json().catch(() => ({}));
    const filaId: string | null = body?.fila_id ?? null;

    // Porta de máquina: service role OU x-cron-secret conferido no vault.
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const tokenChamador = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!(serviceKey && tokenChamador === serviceKey)) {
      const cronSecretHeader = req.headers.get("x-cron-secret");
      const { data: segredo, error: eSeg } = await sb.rpc("get_vault_secret", {
        p_name: "SYNC_CRON_SECRET",
      });
      if (!cronSecretHeader || eSeg || !segredo || segredo !== cronSecretHeader) {
        return json({ ok: false, error: "Credencial de máquina inválida (x-cron-secret)." }, 403);
      }
    }

    const { data: cfgRow, error: eCfg } = await sb.from("integracoes_config")
      .select("ativo, config").eq("sistema", "nf_email_xpm").single();
    if (eCfg) throw new Error(`config nf_email_xpm: ${eCfg.message}`);
    const cfg = (cfgRow?.config ?? {}) as Record<string, string | null>;
    const bucket = cfg.bucket || "contabil";

    // Lote só roda com a integração ativa. Envio unitário (fila_id) é o caminho de teste.
    if (!filaId && cfgRow?.ativo !== true) {
      return json({ ok: true, processados: 0, inativo: true, duracao_ms: Date.now() - t0 });
    }

    let q = sb.from("nf_email_xpm_fila")
      .select("id, nf_id, teste, tentativas, enfileirado_em");
    if (filaId) {
      q = q.eq("id", filaId);
    } else {
      q = q.in("status", ["pendente", "erro"]).lt("tentativas", MAX_TENTATIVAS)
        .eq("teste", false).order("enfileirado_em").limit(20);
    }
    const { data: itens, error: eFila } = await q;
    if (eFila) throw new Error(`ler fila: ${eFila.message}`);
    if (!itens || itens.length === 0) {
      return json({ ok: true, processados: 0, duracao_ms: Date.now() - t0 });
    }

    const { data: apiKey, error: eKey } = await sb.rpc("get_vault_secret", { p_name: "RESEND_API_KEY" });
    if (eKey || !apiKey) throw new Error(`RESEND_API_KEY ausente no vault${eKey ? `: ${eKey.message}` : ""}`);

    const { data: destRows, error: eDest } = await sb.from("nf_email_xpm_destinatario")
      .select("email").eq("ativo", true).order("ordem");
    if (eDest) throw new Error(`ler destinatários: ${eDest.message}`);
    const destProducao = (destRows ?? []).map((d: { email: string }) => d.email);

    let enviados = 0;
    let falhas = 0;
    let aguardando = 0;
    let canceladas = 0;

    for (const item of itens) {
      const tentativa = (item.tentativas ?? 0) + 1;
      const agora = () => new Date().toISOString();
      let pedidoId: string | null = null;

      try {
        const { data: nf, error: eNf } = await sb.from("nfs_emitidas")
          .select("id, numero, serie, situacao, pedido_venda_id, xml_storage_path, pdf_storage_path")
          .eq("id", item.nf_id).single();
        if (eNf || !nf) throw new Error(`ler NF: ${eNf?.message ?? "não encontrada"}`);
        pedidoId = nf.pedido_venda_id ?? null;

        if (nf.situacao !== "autorizada") {
          await sb.from("nf_email_xpm_fila").update({
            status: "nf_cancelada",
            ultimo_erro: `NF em situação '${nf.situacao}' antes do envio — e-mail não enviado.`,
            ultima_tentativa_em: agora(),
          }).eq("id", item.id);
          canceladas++;
          continue;
        }

        let pedidoRef: string | null = null;
        if (pedidoId) {
          const { data: ped } = await sb.from("pedidos").select("id_externo").eq("id", pedidoId).single();
          pedidoRef = ped?.id_externo ?? null;
        }

        // NF ainda sem pedido vinculado: espera o vínculo antes de enviar sem o número.
        if (!pedidoRef) {
          const idadeMin = (Date.now() - new Date(item.enfileirado_em).getTime()) / 60000;
          if (idadeMin < ESPERA_VINCULO_PEDIDO_MIN && !filaId) {
            aguardando++;
            continue;
          }
        }

        if (!nf.xml_storage_path || !nf.pdf_storage_path) {
          throw new Error("NF sem XML ou PDF guardado no storage.");
        }

        const { data: xmlBlob, error: eXml } = await sb.storage.from(bucket).download(nf.xml_storage_path);
        if (eXml || !xmlBlob) throw new Error(`baixar XML: ${eXml?.message ?? "vazio"}`);
        const { data: pdfBlob, error: ePdf } = await sb.storage.from(bucket).download(nf.pdf_storage_path);
        if (ePdf || !pdfBlob) throw new Error(`baixar PDF: ${ePdf?.message ?? "vazio"}`);

        const xmlBytes = new Uint8Array(await xmlBlob.arrayBuffer());
        const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());

        // FAIL-LOUD: nunca sai e-mail com anexo suspeito.
        const xmlInicio = new TextDecoder().decode(xmlBytes.slice(0, 2000)).replace(/^﻿/, "").trim();
        if (!xmlInicio.startsWith("<") || !(xmlInicio.includes("<nfeProc") || xmlInicio.includes("<NFe"))) {
          throw new Error("O arquivo XML guardado não é XML de NF-e.");
        }
        if (new TextDecoder().decode(pdfBytes.slice(0, 5)) !== "%PDF-") {
          throw new Error("O arquivo PDF guardado não é um PDF válido.");
        }

        const destinatarios = item.teste
          ? [String(cfg.destinatario_teste ?? "").trim()].filter(Boolean)
          : destProducao;
        if (destinatarios.length === 0) {
          throw new Error(item.teste ? "destinatario_teste não configurado." : "Nenhum destinatário ativo cadastrado.");
        }

        const numero = String(nf.numero ?? "").trim() || "s/n";
        const assunto = pedidoRef
          ? `[Fetely] - NF de Saída - Pedido ${pedidoRef}`
          : `[Fetely] - NF de Saída - NF ${numero}`;
        const frase = pedidoRef
          ? `Segue em anexo a NF de saída nº ${numero} (XML e PDF), referente ao pedido ${pedidoRef} da Fetely.`
          : `Segue em anexo a NF de saída nº ${numero} (XML e PDF) da Fetely.`;
        const html =
          `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;line-height:1.5">` +
          `<p>Olá,</p><p>${frase}</p>` +
          `<p style="color:#777;font-size:12px">Mensagem automática — Fetely.</p></div>`;
        const text = `Olá,\n\n${frase}\n\nMensagem automática — Fetely.`;

        const resp = await sendResendEmail({
          apiKey: String(apiKey),
          to: destinatarios[0],
          cc: destinatarios.slice(1),
          subject: assunto,
          html,
          text,
          idempotencyKey: `nf-email-xpm-${item.id}-${destinatarios.join(",")}`.slice(0, 250),
          attachments: [
            { filename: `NF_${numero}.xml`, content: encodeBase64(xmlBytes) },
            { filename: `NF_${numero}.pdf`, content: encodeBase64(pdfBytes) },
          ],
        });

        await sb.from("nf_email_xpm_fila").update({
          status: "enviado",
          tentativas: tentativa,
          ultimo_erro: null,
          assunto,
          destinatarios,
          resend_id: resp?.id ?? null,
          enviado_em: agora(),
          ultima_tentativa_em: agora(),
        }).eq("id", item.id);

        const { error: eLog } = await sb.from("email_send_log").insert(
          destinatarios.map((email) => ({
            message_id: resp?.id ?? null,
            template_name: "nf-saida-xpm",
            recipient_email: email,
            status: "sent",
            metadata: { fila_id: item.id, nf_id: nf.id, nf_numero: numero, pedido: pedidoRef, teste: item.teste },
          })),
        );
        if (eLog) console.error("[enviar-nf-email-xpm] email_send_log", eLog.message);

        enviados++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[enviar-nf-email-xpm] falha", { fila_id: item.id, nf_id: item.nf_id, erro: msg });
        await sb.from("nf_email_xpm_fila").update({
          status: "erro",
          tentativas: tentativa,
          ultimo_erro: msg,
          ultima_tentativa_em: agora(),
        }).eq("id", item.id);
        falhas++;

        if (tentativa >= MAX_TENTATIVAS && pedidoId) {
          await sb.from("pedido_eventos").insert({
            pedido_id: pedidoId,
            tipo_evento: "erro_automacao",
            descricao:
              `O e-mail da NF para a XPM não saiu após ${MAX_TENTATIVAS} tentativas. Último erro: ${msg}`,
            metadata: { erro_origem: "enviar-nf-email-xpm", fila_id: item.id, nf_id: item.nf_id },
            automatico: true,
          });
        }
      }
    }

    return json({
      ok: true,
      processados: itens.length,
      enviados,
      falhas,
      aguardando_pedido: aguardando,
      nf_cancelada: canceladas,
      duracao_ms: Date.now() - t0,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[enviar-nf-email-xpm] erro geral", msg);
    return json({ ok: false, erro: msg }, 500);
  }
});