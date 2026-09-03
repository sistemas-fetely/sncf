// Edge Function: nf-download
// Baixa o PDF da NF pelo SERVIDOR (o Bling pede validação de CNPJ quando o
// navegador do usuário abre o link sem sessão; o servidor não tem cookie).
// pdf_url é CACHE (link assinado, ~48h): com bling_id, resolve link fresco e
// faz BACKFILL. Lógica compartilhada em _shared/bling/nf-anexo.ts.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  resolverLinkPdfFresco,
  baixarPdfValidado,
  validarXmlNf,
  NfAnexoError,
} from "../_shared/bling/nf-anexo.ts";
import { exigirPorta, NaoAutorizado } from "../_shared/autorizacao.ts";

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

    // CONCESSAO-QUE-NAO-TRANCA-E-MENTIRA: token valido nao e permissao. O Comercial entra
    // por `acao.mesa_baixar_nf`; Fiscal/Financas entram pela porta de leitura de
    // `nfs_emitidas` no mapa `leitura_tabela_tela`.
    try {
      await exigirPorta(
        supabase,
        userData.user.id,
        { slugs: ["acao.mesa_baixar_nf"], tabelas: ["nfs_emitidas"] },
        "baixar a NF",
      );
    } catch (e) {
      if (e instanceof NaoAutorizado) return err(e.status, e.message);
      throw e;
    }

    const body = await req.json().catch(() => ({}));
    nfId = typeof body?.nf_id === "string" ? body.nf_id.trim() : "";
    if (!nfId) return err(400, "nf_id obrigatório.");
    const formato: "pdf" | "xml" = body?.formato === "xml" ? "xml" : "pdf";

    console.log("[nf-download] início", { nf_id: nfId, formato, user_id: userData.user.id });

    const { data: nf, error: nfErr } = await supabase
      .from("nfs_emitidas")
      .select("id, bling_id, numero, serie, pdf_url, xml_url, chave_acesso")
      .eq("id", nfId)
      .maybeSingle();
    if (nfErr) return err(500, `Falha ao carregar a NF: ${nfErr.message}`, { nf_id: nfId });
    if (!nf) return err(404, `NF ${nfId} não encontrada em nfs_emitidas.`, { nf_id: nfId });

    if (formato === "xml") {
      let xmlTexto: string;
      let origemLink: string;
      let backfill: boolean;
      try {
        const resolvidoXml = await resolverLinkPdfFresco(supabase, null, nf as any);
        origemLink = resolvidoXml.origem;
        backfill = resolvidoXml.backfill;
        const xmlVal = resolvidoXml.xml;
        if (!xmlVal) {
          return err(502, `O Bling não retornou XML para a NF ${nf.numero ?? nfId}.`, {
            nf_id: nfId,
          });
        }
        if (xmlVal.startsWith("http")) {
          const xmlResp = await fetch(xmlVal);
          if (!xmlResp.ok) {
            throw new NfAnexoError(
              502,
              `Falha ao baixar XML da NF ${nf.numero ?? nfId}: HTTP ${xmlResp.status}`,
              { nf_id: nfId },
            );
          }
          xmlTexto = validarXmlNf(await xmlResp.text(), { nf_id: nfId });
        } else {
          xmlTexto = validarXmlNf(xmlVal, { nf_id: nfId });
        }
      } catch (e) {
        if (e instanceof NfAnexoError) return err(e.status, e.message, e.extra);
        throw e;
      }

      const nomeXml = nf.chave_acesso
        ? `NFe-${nf.chave_acesso}.xml`
        : `NF-${nf.numero ?? nfId}${nf.serie ? `-${nf.serie}` : ""}.xml`;
      const xmlBytes = new TextEncoder().encode(xmlTexto);
      console.log("[nf-download] sucesso", {
        nf_id: nfId,
        formato,
        numero: nf.numero,
        origem_link: origemLink,
        bytes: xmlBytes.byteLength,
        backfill,
        arquivo: nomeXml,
      });

      return new Response(xmlBytes, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${nomeXml}"`,
        },
      });
    }

    let resolvido;
    let bytes: Uint8Array;
    try {
      resolvido = await resolverLinkPdfFresco(supabase, null, nf as any);
      bytes = await baixarPdfValidado(resolvido.url, resolvido.origem, { nf_id: nfId });
    } catch (e) {
      if (e instanceof NfAnexoError) return err(e.status, e.message, e.extra);
      throw e;
    }

    const nome = `NF-${nf.numero ?? nfId}${nf.serie ? `-${nf.serie}` : ""}.pdf`;
    console.log("[nf-download] sucesso", {
      nf_id: nfId,
      formato,
      numero: nf.numero,
      origem_link: resolvido.origem,
      bytes: bytes.byteLength,
      backfill: resolvido.backfill,
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
