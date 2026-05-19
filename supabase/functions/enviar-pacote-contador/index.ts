/**
 * Edge Function: enviar-pacote-contador
 *
 * Recebe os metadados de um pacote fiscal já uploaded no bucket
 * pacotes-contador. Cria a remessa, gera signed URL com TTL longo
 * (30 dias), e dispara emails para os destinatários.
 *
 * O ZIP é gerado e uploaded pelo FRONT (lógica JSZip já existe).
 * Esta função apenas orquestra: remessa + signed URL + envio de email.
 *
 * Fluxo esperado pelo cliente:
 *   1. Front gera ZIP e faz upload em pacotes-contador/{uuid}.zip
 *   2. Front chama esta Edge Function passando o storage_path + metadados
 *   3. Esta Edge Function:
 *      - cria remessas_contador (metodo='sistema')
 *      - cria remessas_contador_itens
 *      - gera signed URL (30 dias)
 *      - atualiza remessa com link_signed + link_expira_em
 *      - dispara email pra cada destinatário via send-transactional-email
 *      - retorna { ok, remessa_id, link_signed, qtd_emails_enviados }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TTL_LINK_DIAS = 30;

interface RequestBody {
  storage_path: string;            // ex: "pacotes-contador/abc123.zip"
  descricao_remessa: string;
  periodo_inicio: string;          // YYYY-MM-DD
  periodo_fim: string;             // YYYY-MM-DD
  destinatarios: string[];         // emails
  observacao?: string | null;
  conta_ids: string[];
  assunto?: string | null;         // opcional - se passado, sobrepõe subject default
  mensagem_personalizada?: string; // corpo customizado pelo usuário
  qtd_documentos: number;
  valor_total: number;             // pra exibir no email
  remetente_nome?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResp({ ok: false, erro: "Não autorizado" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);
    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userRes?.user) {
      return jsonResp({ ok: false, erro: "Sessão inválida" }, 401);
    }
    const userId = userRes.user.id;

    // Parse body
    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return jsonResp({ ok: false, erro: "JSON inválido" }, 400);
    }

    // Validações
    if (!body.storage_path || !body.storage_path.startsWith("pacotes-contador/")) {
      return jsonResp({ ok: false, erro: "storage_path inválido" }, 400);
    }
    if (!Array.isArray(body.conta_ids) || body.conta_ids.length === 0) {
      return jsonResp({ ok: false, erro: "Nenhuma conta informada" }, 400);
    }
    if (!Array.isArray(body.destinatarios) || body.destinatarios.length === 0) {
      return jsonResp({ ok: false, erro: "Nenhum destinatário informado" }, 400);
    }
    if (!body.periodo_inicio || !body.periodo_fim) {
      return jsonResp({ ok: false, erro: "Período inválido" }, 400);
    }

    // 1. Criar remessa
    const linkExpiraEm = new Date();
    linkExpiraEm.setDate(linkExpiraEm.getDate() + TTL_LINK_DIAS);

    const { data: remessa, error: errRemessa } = await supabaseAdmin
      .from("remessas_contador")
      .insert({
        descricao: body.descricao_remessa,
        periodo_inicio: body.periodo_inicio,
        periodo_fim: body.periodo_fim,
        enviada_em: new Date().toISOString(),
        enviada_por: userId,
        metodo: "sistema",
        destinatarios: body.destinatarios,
        observacao: body.observacao ?? null,
        qtd_documentos: body.qtd_documentos,
        qtd_contas: body.conta_ids.length,
        link_expira_em: linkExpiraEm.toISOString(),
      })
      .select()
      .single();

    if (errRemessa) {
      console.error("Erro criando remessa", errRemessa);
      return jsonResp({ ok: false, erro: "Falha ao criar remessa: " + errRemessa.message }, 500);
    }

    const remessaId = remessa.id;

    // 2. Criar itens (1 por conta) com snapshot de doc_ids
    const { data: docsRows } = await supabaseAdmin
      .from("contas_pagar_documentos")
      .select("id, conta_pagar_id")
      .in("conta_pagar_id", body.conta_ids);

    const docsByConta = new Map<string, string[]>();
    (docsRows || []).forEach((d: { id: string; conta_pagar_id: string }) => {
      const arr = docsByConta.get(d.conta_pagar_id) || [];
      arr.push(d.id);
      docsByConta.set(d.conta_pagar_id, arr);
    });

    const itens = body.conta_ids.map((cid) => ({
      remessa_id: remessaId,
      conta_id: cid,
      doc_ids: docsByConta.get(cid) || [],
    }));

    const { error: errItens } = await supabaseAdmin
      .from("remessas_contador_itens")
      .insert(itens);

    if (errItens) {
      console.error("Erro criando itens", errItens);
      await supabaseAdmin.from("remessas_contador").delete().eq("id", remessaId);
      return jsonResp({ ok: false, erro: "Falha ao criar itens: " + errItens.message }, 500);
    }

    // 3. Gerar signed URL com TTL longo
    const pathSemBucket = body.storage_path.replace(/^pacotes-contador\//, "");
    const { data: signedData, error: errSigned } = await supabaseAdmin.storage
      .from("pacotes-contador")
      .createSignedUrl(pathSemBucket, TTL_LINK_DIAS * 24 * 60 * 60);

    if (errSigned || !signedData?.signedUrl) {
      console.error("Erro gerando signed URL", errSigned);
      return jsonResp({
        ok: false,
        erro: "Falha ao gerar link: " + (errSigned?.message ?? "desconhecido"),
        remessa_id: remessaId,
      }, 500);
    }

    const linkSigned = signedData.signedUrl;

    // 4. Atualizar remessa com link
    await supabaseAdmin
      .from("remessas_contador")
      .update({ link_signed: linkSigned })
      .eq("id", remessaId);

    // 5. Disparar emails
    const periodoStr = `${formatBR(body.periodo_inicio)} a ${formatBR(body.periodo_fim)}`;
    const linkExpiraStr = formatBR(linkExpiraEm.toISOString().slice(0, 10));
    const valorBR = body.valor_total.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

    let qtdEnviados = 0;
    const errosEmail: string[] = [];

    // IMPORTANTE: send-transactional-email faz auth.getUser(token) internamente
    // e exige JWT de USUÁRIO real. Se chamarmos via supabaseAdmin.functions.invoke(),
    // o token enviado é o service_role e a validação falha com 401.
    // Solução: fetch direto, forwardando o JWT ORIGINAL do user que chamou
    // enviar-pacote-contador. Esse token é válido pra auth.getUser().
    const sendEmailUrl = `${supabaseUrl}/functions/v1/send-transactional-email`;

    for (const email of body.destinatarios) {
      try {
        const sendResp = await fetch(sendEmailUrl, {
          method: "POST",
          headers: {
            "Authorization": authHeader,    // token ORIGINAL do user (não service_role)
            "apikey": anonKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            templateName: "pacote-fiscal-contador",
            recipientEmail: email,
            idempotencyKey: `pacote-${remessaId}-${email}-${Date.now()}`,
            templateData: {
              mensagem_personalizada: body.mensagem_personalizada || "",
              descricao_remessa: body.descricao_remessa,
              qtd_contas: body.conta_ids.length,
              qtd_documentos: body.qtd_documentos,
              valor_total: valorBR,
              link_zip: linkSigned,
              link_expira_em: linkExpiraStr,
              periodo: periodoStr,
              remetente_nome: body.remetente_nome || "Equipe Fetely",
            },
            metadata: {
              remessa_id: remessaId,
              feature: "pacote_contador",
            },
          }),
        });

        const sendRes = await sendResp.json().catch(() => null);

        if (!sendResp.ok) {
          const errMsg =
            (sendRes && typeof sendRes === "object" && "error" in sendRes
              ? String(sendRes.error)
              : `HTTP ${sendResp.status}`);
          errosEmail.push(`${email}: ${errMsg}`);
          continue;
        }
        if (sendRes && typeof sendRes === "object" && "error" in sendRes && sendRes.error) {
          errosEmail.push(`${email}: ${sendRes.error}`);
          continue;
        }
        qtdEnviados++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errosEmail.push(`${email}: ${msg}`);
      }
    }

    if (qtdEnviados === 0 && errosEmail.length > 0) {
      console.warn("Remessa criada mas nenhum email enviado", {
        remessaId,
        errosEmail,
      });
      return jsonResp({
        ok: false,
        erro: "Remessa registrada mas falha ao enviar emails: " + errosEmail.join("; "),
        remessa_id: remessaId,
        link_signed: linkSigned,
        qtd_emails_enviados: 0,
      }, 200);
    }

    return jsonResp({
      ok: true,
      remessa_id: remessaId,
      link_signed: linkSigned,
      link_expira_em: linkExpiraEm.toISOString(),
      qtd_emails_enviados: qtdEnviados,
      qtd_documentos: body.qtd_documentos,
      qtd_contas: body.conta_ids.length,
      avisos: errosEmail.length > 0 ? errosEmail : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Erro inesperado", e);
    return jsonResp({ ok: false, erro: "Erro inesperado: " + msg }, 500);
  }
});

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatBR(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
