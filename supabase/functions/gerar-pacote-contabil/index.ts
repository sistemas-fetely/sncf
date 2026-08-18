/**
 * Edge Function: gerar-pacote-contabil
 *
 * TELA 2 de Contabilidade — Pacote do Contador.
 * O .xlsx e gerado e enviado ao bucket pacotes-contador pelo FRONT.
 * Esta funcao apenas orquestra: valida competencia fechada, cria a remessa,
 * gera signed URL de 30 dias e dispara e-mail aos destinatarios.
 *
 * Espelha enviar-pacote-contador (auth, signed URL, envio de e-mail).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TTL_LINK_DIAS = 30;

interface RequestBody {
  competencia: string;            // YYYY-MM-DD (dia 1)
  storage_path: string;           // fechamento/{YYYY-MM}/{uuid}.xlsx
  destinatarios?: string[];
  observacao?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResp({ ok: false, erro: "Não autorizado" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userRes?.user) {
      return jsonResp({ ok: false, erro: "Sessão inválida" }, 401);
    }
    const userId = userRes.user.id;

    const { data: ehAdmin, error: errRole } = await admin.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin",
    });
    if (errRole) {
      return jsonResp({ ok: false, erro: "Falha ao validar permissão: " + errRole.message }, 500);
    }
    if (!ehAdmin) {
      return jsonResp({ ok: false, erro: "Apenas super admin pode gerar o pacote do contador" }, 403);
    }

    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return jsonResp({ ok: false, erro: "JSON inválido" }, 400);
    }

    if (!body.competencia || !/^\d{4}-\d{2}-\d{2}$/.test(body.competencia)) {
      return jsonResp({ ok: false, erro: "Competência inválida" }, 400);
    }
    if (!body.storage_path || !body.storage_path.endsWith(".xlsx")) {
      return jsonResp({ ok: false, erro: "storage_path inválido" }, 400);
    }

    // 1. Competência precisa estar fechada
    const { data: fech, error: errFech } = await admin
      .from("contabil_fechamento")
      .select("id, competencia, status, unidades, valor_custo, skus")
      .eq("competencia", body.competencia)
      .maybeSingle();

    if (errFech) {
      return jsonResp({ ok: false, erro: "Falha ao ler fechamento: " + errFech.message }, 500);
    }
    if (!fech) {
      return jsonResp({ ok: false, erro: "Competência não existe em contabil_fechamento" }, 400);
    }
    if (fech.status !== "fechado") {
      return jsonResp(
        { ok: false, erro: `Feche a competência antes de gerar o pacote (status atual: ${fech.status})` },
        400,
      );
    }

    const inicio = body.competencia.slice(0, 8) + "01";
    const d = new Date(`${inicio}T00:00:00Z`);
    const fim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
      .toISOString()
      .slice(0, 10);
    const rotulo = `${inicio.slice(5, 7)}/${inicio.slice(0, 4)}`;

    const destinatarios = Array.isArray(body.destinatarios)
      ? body.destinatarios.filter((e) => typeof e === "string" && e.includes("@"))
      : [];

    const linkExpiraEm = new Date();
    linkExpiraEm.setDate(linkExpiraEm.getDate() + TTL_LINK_DIAS);

    // 2. Criar remessa
    const { data: remessa, error: errRemessa } = await admin
      .from("remessas_contador")
      .insert({
        tipo: "fechamento_estoque",
        fechamento_id: fech.id,
        storage_path: body.storage_path,
        descricao: `Pacote contábil ${rotulo}`,
        periodo_inicio: inicio,
        periodo_fim: fim,
        enviada_em: new Date().toISOString(),
        enviada_por: userId,
        metodo: "sistema",
        destinatarios,
        observacao: body.observacao ?? null,
        qtd_documentos: Number(fech.skus ?? 0),
        link_expira_em: linkExpiraEm.toISOString(),
      })
      .select("id")
      .single();

    if (errRemessa) {
      console.error("Erro criando remessa", errRemessa);
      return jsonResp({ ok: false, erro: "Falha ao criar remessa: " + errRemessa.message }, 500);
    }
    const remessaId = remessa.id;

    // 3. Signed URL 30 dias
    const pathSemBucket = body.storage_path.replace(/^pacotes-contador\//, "");
    const { data: signedData, error: errSigned } = await admin.storage
      .from("pacotes-contador")
      .createSignedUrl(pathSemBucket, TTL_LINK_DIAS * 24 * 60 * 60);

    if (errSigned || !signedData?.signedUrl) {
      console.error("Erro gerando signed URL", errSigned);
      return jsonResp(
        {
          ok: false,
          erro: "Falha ao gerar link: " + (errSigned?.message ?? "desconhecido"),
          remessa_id: remessaId,
        },
        500,
      );
    }
    const linkSigned = signedData.signedUrl;

    const { error: errUpd } = await admin
      .from("remessas_contador")
      .update({ link_signed: linkSigned })
      .eq("id", remessaId);
    if (errUpd) {
      console.error("Erro gravando link", errUpd);
    }

    // 4. E-mails (opcional)
    let qtdEnviados = 0;
    const errosEmail: string[] = [];
    if (destinatarios.length > 0) {
      const valorBR = Number(fech.valor_custo ?? 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
      const sendEmailUrl = `${supabaseUrl}/functions/v1/send-transactional-email`;

      for (const email of destinatarios) {
        try {
          const resp = await fetch(sendEmailUrl, {
            method: "POST",
            headers: {
              Authorization: authHeader, // token ORIGINAL do usuário
              apikey: anonKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              templateName: "pacote-fiscal-contador",
              recipientEmail: email,
              idempotencyKey: `pacote-contabil-${remessaId}-${email}`,
              templateData: {
                mensagem_personalizada: body.observacao || "",
                descricao_remessa: `Pacote contábil ${rotulo}`,
                qtd_contas: 0,
                qtd_documentos: Number(fech.skus ?? 0),
                valor_total: valorBR,
                link_zip: linkSigned,
                link_expira_em: formatBR(linkExpiraEm.toISOString().slice(0, 10)),
                periodo: `${formatBR(inicio)} a ${formatBR(fim)}`,
                remetente_nome: "Equipe Fetély",
              },
              metadata: { remessa_id: remessaId, feature: "pacote_contabil" },
            }),
          });
          const res = await resp.json().catch(() => null);
          if (!resp.ok) {
            errosEmail.push(
              `${email}: ${res && typeof res === "object" && "error" in res ? String(res.error) : `HTTP ${resp.status}`}`,
            );
            continue;
          }
          if (res && typeof res === "object" && "error" in res && res.error) {
            errosEmail.push(`${email}: ${String(res.error)}`);
            continue;
          }
          qtdEnviados++;
        } catch (e) {
          errosEmail.push(`${email}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    return jsonResp({
      ok: true,
      remessa_id: remessaId,
      link_signed: linkSigned,
      link_expira_em: linkExpiraEm.toISOString(),
      qtd_emails_enviados: qtdEnviados,
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
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
