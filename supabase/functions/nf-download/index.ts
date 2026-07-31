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

const err = (status: number, msg: string, extra?: Record<string, unknown>) =>
  new Response(JSON.stringify({ error: msg, ...(extra ?? {}) }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return err(405, "Método não permitido. Use POST.");

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Documento fiscal: exige usuário autenticado.
    const auth = req.headers.get("Authorization");
    if (!auth) return err(401, "Não autorizado: token ausente.");
    const { data: userData, error: userErr } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (userErr || !userData?.user) return err(401, "Não autorizado: sessão inválida.");

    const body = await req.json().catch(() => ({}));
    const nfId = typeof body?.nf_id === "string" ? body.nf_id.trim() : "";
    if (!nfId) return err(400, "nf_id obrigatório.");

    const { data: nf, error: nfErr } = await supabase
      .from("nfs_emitidas")
      .select("id, bling_id, numero, serie, pdf_url, xml_url")
      .eq("id", nfId)
      .maybeSingle();
    if (nfErr) return err(500, `Falha ao carregar a NF: ${nfErr.message}`);
    if (!nf) return err(404, `NF ${nfId} não encontrada em nfs_emitidas.`);

    let pdfUrl: string | null = nf.pdf_url ?? null;

    // 2. Sem link: resolve no Bling e faz backfill.
    if (!pdfUrl) {
      if (!nf.bling_id) {
        return err(
          404,
          `NF ${nf.numero ?? nfId} não tem pdf_url nem bling_id — não há como resolver o PDF no Bling.`,
        );
      }

      const { data: cfgData } = await supabase
        .from("integracoes_config")
        .select("*")
        .eq("sistema", "bling")
        .maybeSingle();
      if (!cfgData?.access_token) return err(409, "Bling não conectado. Conecte a integração para resolver o PDF.");

      const cfg = cfgData as unknown as BlingConfig;
      const token = await ensureFreshToken(supabase, cfg);
      const client = makeBlingClient(supabase, cfg, token);

      const res = await client.get(`/nfe/${nf.bling_id}`);
      const d = res?.data ?? {};
      const link = String(d.linkPDF ?? d.linkDanfe ?? "").trim();
      const linkXml = String(d.xml ?? "").trim();
      if (!link) {
        return err(
          502,
          `Bling não retornou linkPDF nem linkDanfe para a NF ${nf.numero ?? nf.bling_id} (${BLING_BASE}/nfe/${nf.bling_id}).`,
        );
      }

      const patch: Record<string, unknown> = { pdf_url: link };
      if (linkXml && !nf.xml_url) patch.xml_url = linkXml;
      const { error: upErr } = await supabase.from("nfs_emitidas").update(patch).eq("id", nf.id);
      if (upErr) return err(500, `PDF resolvido, mas o backfill falhou: ${upErr.message}`);

      pdfUrl = link;
    }

    // 3. Fetch server-side (sem cookie de sessão → sem tela de CNPJ).
    const pdfRes = await fetch(pdfUrl, { headers: { Accept: "application/pdf,*/*" } });
    if (!pdfRes.ok) {
      const trecho = (await pdfRes.text().catch(() => "")).slice(0, 300);
      return err(502, `Bling recusou o download do PDF (HTTP ${pdfRes.status}).`, { detalhe: trecho });
    }

    const ct = (pdfRes.headers.get("content-type") || "").toLowerCase();
    const bytes = new Uint8Array(await pdfRes.arrayBuffer());
    const assinatura = new TextDecoder().decode(bytes.slice(0, 5));
    if (!ct.includes("pdf") && assinatura !== "%PDF-") {
      const trecho = new TextDecoder().decode(bytes.slice(0, 300));
      return err(502, `A resposta do Bling não é um PDF (content-type: ${ct || "desconhecido"}).`, {
        detalhe: trecho,
      });
    }

    const nome = `NF-${nf.numero ?? nfId}${nf.serie ? `-${nf.serie}` : ""}.pdf`;
    return new Response(bytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nome}"`,
      },
    });
  } catch (e) {
    return err(500, (e as Error).message || String(e));
  }
});
