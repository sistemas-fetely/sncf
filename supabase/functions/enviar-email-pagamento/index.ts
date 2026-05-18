import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DocLink {
  tipo: string;
  nome: string;
  url: string;
}

interface DocInput {
  tipo: string;
  nome_arquivo: string;
  storage_path: string;
}

interface ParcelaItem {
  numero: string;
  valor: string;
  vencimento: string;
}

const TIPO_DOC_LABEL: Record<string, string> = {
  nf: "NF",
  recibo: "Recibo",
  boleto: "Boleto",
  ticket_cartao: "Ticket cartão",
  comprovante: "Comprovante",
  contrato: "Contrato",
  outro: "Outro",
};

const LIMITE_TOTAL_BYTES_BASE64 = 18 * 1024 * 1024; // 18 MB
const SIGNED_URL_DURACAO_SEG = 60 * 60 * 24 * 30; // 30 dias

function formatBRL(valor: number | null | undefined): string {
  if (valor == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}

function formatDateBR(data: string | null | undefined): string {
  if (!data) return "—";
  const d = new Date(data);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ ok: false, erro: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseService = createClient(supabaseUrl, serviceKey);
    const supabaseAsUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await supabaseAsUser.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ ok: false, erro: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = userData.user.id;

    const body = await req.json();
    const cprId: string = body.cpr_id;
    const emailDestinatario: string = body.email_destinatario;
    const mensagemPersonalizada: string = body.mensagem_personalizada ?? "";
    const docs: DocInput[] = Array.isArray(body.docs) ? body.docs : [];

    if (!cprId || !emailDestinatario) {
      return new Response(
        JSON.stringify({ ok: false, erro: "cpr_id e email_destinatario sao obrigatorios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: cpr, error: cprError } = await supabaseService
      .from("contas_pagar_receber")
      .select(`
        id, valor, data_vencimento, status, nf_numero, descricao,
        fornecedor_cliente, parceiro_id, observacao_pagamento,
        parcelas, parcela_atual, parcela_grupo_id,
        forma_pagamento:formas_pagamento (id, codigo, nome, envio_agrupa_parcelas),
        plano_contas (codigo, nome),
        parceiros_comerciais (razao_social, dados_bancarios)
      `)
      .eq("id", cprId)
      .single();

    if (cprError || !cpr) {
      return new Response(
        JSON.stringify({ ok: false, erro: "CPR não encontrada", detalhe: cprError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cprAny = cpr as any;

    const formaAgrupa = cprAny.forma_pagamento?.envio_agrupa_parcelas === true;
    const temGrupo = !!cprAny.parcela_grupo_id;
    const ehAgrupado = formaAgrupa && temGrupo;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parcelasCPRs: any[] = [cprAny];
    if (ehAgrupado) {
      const { data: irmas } = await supabaseService
        .from("contas_pagar_receber")
        .select("id, valor, data_vencimento, parcela_atual, parcelas, status")
        .eq("parcela_grupo_id", cprAny.parcela_grupo_id)
        .in("status", ["aberto", "aprovado"])
        .order("parcela_atual", { ascending: true });
      if (irmas && irmas.length > 0) parcelasCPRs = irmas;
    }

    const idsAtualizar = parcelasCPRs.map((p) => p.id);
    const agora = new Date().toISOString();
    const { error: updateErr } = await supabaseService
      .from("contas_pagar_receber")
      .update({
        status: "enviado_para_pagamento",
        enviado_pagamento_em: agora,
        enviado_pagamento_por: callerId,
        email_pagamento_enviado: true,
      })
      .in("id", idsAtualizar);

    if (updateErr) {
      return new Response(
        JSON.stringify({ ok: false, erro: "Falha ao atualizar status", detalhe: updateErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === BUSCAR DOCS VIA RPC (v4 - bypass RLS) ===
    type DocFonte = { tipo: string; nome_arquivo: string; storage_path: string; bucket: string };
    const docsFromBanco: DocFonte[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: docsRpc, error: rpcErr } = await (supabaseService as any)
      .rpc("buscar_docs_pagamento", { p_cpr_id: cprId });

    if (rpcErr) {
      console.error("[email-pagto v4] erro na RPC buscar_docs_pagamento", rpcErr);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const d of (docsRpc || []) as any[]) {
      if (d?.storage_path) docsFromBanco.push({
        tipo: d.tipo || "outro",
        nome_arquivo: d.nome_arquivo || "documento",
        storage_path: d.storage_path,
        bucket: d.bucket || "financeiro-docs",
      });
    }

    // Dedup por storage_path
    const docsUnicos: DocFonte[] = [];
    const seenPaths = new Set<string>();
    for (const d of docsFromBanco) {
      if (!seenPaths.has(d.storage_path)) {
        seenPaths.add(d.storage_path);
        docsUnicos.push(d);
      }
    }

    console.log(`[email-pagto v4] cprId=${cprId}, docs_encontrados=${docsUnicos.length}, rpc_rows=${(docsRpc || []).length}`);

    const attachments: Array<{ filename: string; content: string }> = [];
    const linksDocs: DocLink[] = [];
    let tamanhoTotalBase64 = 0;

    for (const doc of docsUnicos) {
      try {
        const { data: blob, error: dlErr } = await supabaseService.storage
          .from(doc.bucket)
          .download(doc.storage_path);

        if (dlErr || !blob) {
          console.error(`[email-pagto] download falhou: ${doc.storage_path}`, dlErr);
          const { data: signed } = await supabaseService.storage
            .from(doc.bucket)
            .createSignedUrl(doc.storage_path, SIGNED_URL_DURACAO_SEG);
          if (signed?.signedUrl) {
            linksDocs.push({
              tipo: TIPO_DOC_LABEL[doc.tipo] ?? doc.tipo,
              nome: doc.nome_arquivo,
              url: signed.signedUrl,
            });
          }
          continue;
        }

        const arrayBuffer = await blob.arrayBuffer();
        const tamanhoRaw = arrayBuffer.byteLength;
        const tamanhoBase64Est = Math.ceil(tamanhoRaw * 1.37);

        if (tamanhoTotalBase64 + tamanhoBase64Est <= LIMITE_TOTAL_BYTES_BASE64) {
          const base64 = arrayBufferToBase64(arrayBuffer);
          const filenameFinal = doc.nome_arquivo.toLowerCase().endsWith(".pdf")
            ? doc.nome_arquivo
            : `${doc.nome_arquivo}.pdf`;
          attachments.push({
            filename: filenameFinal,
            content: base64,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            content_type: "application/pdf",
          } as any);
          tamanhoTotalBase64 += tamanhoBase64Est;
        } else {
          const { data: signed } = await supabaseService.storage
            .from(doc.bucket)
            .createSignedUrl(doc.storage_path, SIGNED_URL_DURACAO_SEG);
          if (signed?.signedUrl) {
            linksDocs.push({
              tipo: TIPO_DOC_LABEL[doc.tipo] ?? doc.tipo,
              nome: doc.nome_arquivo,
              url: signed.signedUrl,
            });
          }
        }
      } catch (e) {
        console.error("[email-pagto] erro processando", doc.nome_arquivo, e);
        const { data: signed } = await supabaseService.storage
          .from(doc.bucket)
          .createSignedUrl(doc.storage_path, SIGNED_URL_DURACAO_SEG);
        if (signed?.signedUrl) {
          linksDocs.push({
            tipo: TIPO_DOC_LABEL[doc.tipo] ?? doc.tipo,
            nome: doc.nome_arquivo,
            url: signed.signedUrl,
          });
        }
      }
    }

    const fornecedorNome =
      cprAny.parceiros_comerciais?.razao_social || cprAny.fornecedor_cliente || "—";
    const dadosBancarios = (cprAny.parceiros_comerciais?.dados_bancarios as any) || {};
    const categoriaTxt = cprAny.plano_contas
      ? `${cprAny.plano_contas.codigo || ""} ${cprAny.plano_contas.nome || ""}`.trim() || "—"
      : "—";
    const formaPagamentoNome = cprAny.forma_pagamento?.nome ?? "—";

    let templateData: Record<string, any>;

    if (ehAgrupado && parcelasCPRs.length > 1) {
      const valorTotal = parcelasCPRs.reduce((sum, p) => sum + (Number(p.valor) || 0), 0);
      const totalParcelasGrupo = cprAny.parcelas || parcelasCPRs.length;
      const parcelasList: ParcelaItem[] = parcelasCPRs.map((p) => ({
        numero: `${p.parcela_atual}/${totalParcelasGrupo}`,
        valor: formatBRL(p.valor),
        vencimento: formatDateBR(p.data_vencimento),
      }));

      templateData = {
        fornecedor: fornecedorNome,
        valor_total: formatBRL(valorTotal),
        forma_pagamento_nome: formaPagamentoNome,
        parcelas: parcelasList,
        nf_numero: cprAny.nf_numero || "—",
        categoria: categoriaTxt,
        banco: dadosBancarios.banco || "—",
        agencia: dadosBancarios.agencia || "—",
        conta_bancaria: dadosBancarios.conta || "—",
        pix: dadosBancarios.pix || "—",
        observacao: cprAny.observacao_pagamento || "—",
        mensagem_personalizada: mensagemPersonalizada,
        documentos_links: linksDocs,
      };
    } else {
      templateData = {
        fornecedor: fornecedorNome,
        valor: formatBRL(cprAny.valor),
        vencimento: formatDateBR(cprAny.data_vencimento),
        forma_pagamento_nome: formaPagamentoNome,
        nf_numero: cprAny.nf_numero || "—",
        categoria: categoriaTxt,
        banco: dadosBancarios.banco || "—",
        agencia: dadosBancarios.agencia || "—",
        conta_bancaria: dadosBancarios.conta || "—",
        pix: dadosBancarios.pix || "—",
        observacao: cprAny.observacao_pagamento || "—",
        mensagem_personalizada: mensagemPersonalizada,
        documentos_links: linksDocs,
      };
    }

    const emailResp = await fetch(
      `${supabaseUrl}/functions/v1/send-transactional-email`,
      {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          apikey: anonKey,
        },
        body: JSON.stringify({
          templateName: "pagamento-solicitacao",
          recipientEmail: emailDestinatario,
          idempotencyKey: `pgto-${cprId}-${Date.now()}`,
          templateData,
          attachments,
          metadata: {
            cpr_id: cprId,
            agrupado: ehAgrupado,
            num_parcelas_enviadas: parcelasCPRs.length,
            num_attachments: attachments.length,
            num_links: linksDocs.length,
            patch_version: "v6-bucket-dinamico",
            // Debug v5 — saber por que RPC retorna 0
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            rpc_error: rpcErr ? JSON.stringify(rpcErr) : null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            rpc_rows: ((docsRpc as any) || []).length,
            docs_unicos: docsUnicos.length,
            service_key_presente: !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
          },
        }),
      }
    );

    if (!emailResp.ok) {
      const errBody = await emailResp.text().catch(() => "");
      return new Response(
        JSON.stringify({
          ok: false,
          erro: "Falha ao enviar email",
          status: emailResp.status,
          detalhe: errBody,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        agrupado: ehAgrupado,
        parcelas_enviadas: parcelasCPRs.length,
        num_attachments: attachments.length,
        num_links: linksDocs.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("enviar-email-pagamento erro fatal", e);
    return new Response(
      JSON.stringify({ ok: false, erro: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
