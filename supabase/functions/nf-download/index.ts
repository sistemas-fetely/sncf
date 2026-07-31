// Edge Function: nf-download
// Baixa o PDF da NF pelo SERVIDOR (o Bling pede validação de CNPJ quando o
// navegador do usuário abre o link sem sessão; o servidor não tem cookie).
// Resolve pdf_url; se faltar, busca no Bling por bling_id e faz BACKFILL.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { ensureFreshToken, makeBlingClient, BLING_BASE, type BlingConfig } from "../_shared/bling/bling-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const err = (status: number, msg: string, extra?: Record<string, unknown>) => {
  console.error(`[nf-download] ${status} ${msg}`, extra ?? {});
  return new Response(JSON.stringify({ error: msg, ...(extra ?? {}) }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return err(405, "Método não permitido. Use POST.", { method: req.method });

  let nfId = "";
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Documento fiscal: exige usuário autenticado.
    const auth = req.headers.get("Authorization");
    if (!auth) return err(401, "Não autorizado: token ausente.");
    const { data: userData, error: userErr } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (userErr || !userData?.user) {
      return err(401, "Não autorizado: sessão inválida.", { detalhe_auth: userErr?.message ?? null });
    }

    const body = await req.json().catch(() => ({}));
    nfId = typeof body?.nf_id === "string" ? body.nf_id.trim() : "";
    if (!nfId) return err(400, "nf_id obrigatório.");

    console.log("[nf-download] início", { nf_id: nfId, user_id: userData.user.id });

    const { data: nf, error: nfErr } = await supabase
      .from("nfs_emitidas")
      .select("id, bling_id, numero, serie, pdf_url, xml_url")
      .eq("id", nfId)
      .maybeSingle();
    if (nfErr) return err(500, `Falha ao carregar a NF: ${nfErr.message}`, { nf_id: nfId });
    if (!nf) return err(404, `NF ${nfId} não encontrada em nfs_emitidas.`, { nf_id: nfId });

    let pdfUrl: string | null = nf.pdf_url ?? null;
    let houveBackfill = false;

    // 2. Sem link: resolve no Bling e faz backfill.
    if (!pdfUrl) {
      if (!nf.bling_id) {
        return err(
          404,
          `NF ${nf.numero ?? nfId} não tem pdf_url nem bling_id — não há como resolver o PDF no Bling.`,
          { nf_id: nfId },
        );
      }

      const { data: cfgData } = await supabase
        .from("integracoes_config")
        .select("*")
        .eq("sistema", "bling")
        .maybeSingle();
      if (!cfgData?.access_token) {
        return err(409, "Bling não conectado. Conecte a integração para resolver o PDF.", { nf_id: nfId });
      }

      const cfg = cfgData as unknown as BlingConfig;
      const token = await ensureFreshToken(supabase, cfg);
      const client = makeBlingClient(supabase, cfg, token);

      console.log("[nf-download] resolvendo no Bling", { nf_id: nfId, bling_id: nf.bling_id });
      const res = await client.get(`/nfe/${nf.bling_id}`);
      const d = res?.data ?? {};
      const link = String(d.linkPDF ?? d.linkDanfe ?? "").trim();
      const linkXml = String(d.xml ?? "").trim();
      if (!link) {
        return err(
          502,
          `Bling não retornou linkPDF nem linkDanfe para a NF ${nf.numero ?? nf.bling_id} (${BLING_BASE}/nfe/${nf.bling_id}).`,
          { nf_id: nfId, bling_id: nf.bling_id },
        );
      }

      const patch: Record<string, unknown> = { pdf_url: link };
      if (linkXml && !nf.xml_url) patch.xml_url = linkXml;
      const { error: upErr } = await supabase.from("nfs_emitidas").update(patch).eq("id", nf.id);
      if (upErr) return err(500, `PDF resolvido, mas o backfill falhou: ${upErr.message}`, { nf_id: nfId });

      pdfUrl = link;
      houveBackfill = true;
    }

    // 3. Fetch server-side (sem cookie de sessão → sem tela de CNPJ).
    // doc.view.php responde 302 → security.file.php (200, application/pdf).
    const pdfRes = await fetch(pdfUrl, { headers: { Accept: "application/pdf,*/*" } });
    const ct = (pdfRes.headers.get("content-type") || "").toLowerCase();
    console.log("[nf-download] resposta do Bling", {
      nf_id: nfId,
      status: pdfRes.status,
      content_type: ct || null,
      url_final: pdfRes.url,
      redirecionado: pdfRes.redirected,
    });

    if (!pdfRes.ok) {
      const trecho = (await pdfRes.text().catch(() => "")).slice(0, 300);
      return err(502, `Bling recusou o download do PDF (HTTP ${pdfRes.status}).`, { detalhe: trecho, nf_id: nfId });
    }

    const bytes = new Uint8Array(await pdfRes.arrayBuffer());
    const assinatura = new TextDecoder().decode(bytes.slice(0, 5));
    if (!ct.includes("pdf") && assinatura !== "%PDF-") {
      const trecho = new TextDecoder().decode(bytes.slice(0, 300));
      return err(502, `A resposta do Bling não é um PDF (content-type: ${ct || "desconhecido"}).`, {
        detalhe: trecho,
        nf_id: nfId,
      });
    }

    const nome = `NF-${nf.numero ?? nfId}${nf.serie ? `-${nf.serie}` : ""}.pdf`;
    console.log("[nf-download] sucesso", {
      nf_id: nfId,
      numero: nf.numero,
      bytes: bytes.byteLength,
      backfill: houveBackfill,
      arquivo: nome,
    });

    return new Response(bytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        // octet-stream: qualquer cliente trata como binário puro, sem parsear.
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${nome}"`,
      },
    });
  } catch (e) {
    return err(500, (e as Error).message || String(e), { nf_id: nfId, stack: (e as Error).stack ?? null });
  }
});
