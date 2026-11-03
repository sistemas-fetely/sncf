/**
 * Edge Function: gerar-resumo-nfe-pdf
 *
 * Doutrina #16 — "XML é dado, PDF é prova".
 *
 * Recebe XML de NFe v4.00 (modelo 55) e devolve PDF de "Resumo NF-e",
 * claramente identificado como gerado automaticamente. Substitui o DANFE
 * oficial APENAS pra fins de evidência humana-legível ao contador.
 *
 * Modos de input:
 *   1. { xml_content: "<?xml...>" }
 *   2. { storage_path: "abc/123.xml", bucket: "nfs-stage" }
 *
 * Output:
 *   { ok: true, pdf_base64, chave_nfe, numero_nf }
 *   { ok: false, erro: "..." }
 *
 * Esta função NÃO persiste nada — apenas gera. Persistência fica pra Fase B.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { parseNFe, buildPdf, type NFeParsed } from "../_shared/nfe-resumo-pdf.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  xml_content?: string;
  storage_path?: string;
  bucket?: string;
}

// ----- Tipos parsed (subset NFe v4.00) -----
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResp({ ok: false, erro: "Não autorizado" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const token = authHeader.replace("Bearer ", "");

    // Bypass quando chamado internamente com service-role (worker → edge)
    const isServiceRole = serviceRoleKey.length > 0 && token === serviceRoleKey;
    if (!isServiceRole) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
      if (claimsErr || !claims?.claims) {
        return jsonResp({ ok: false, erro: "Sessão inválida" }, 401);
      }
    }

    // Parse body
    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return jsonResp({ ok: false, erro: "JSON inválido" }, 400);
    }

    // Resolve XML content
    let xmlContent: string;
    if (body.xml_content && typeof body.xml_content === "string") {
      xmlContent = body.xml_content;
    } else if (body.storage_path && body.bucket) {
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const adminClient = createClient(supabaseUrl, serviceKey);
      const { data: file, error: dlErr } = await adminClient.storage
        .from(body.bucket)
        .download(body.storage_path);
      if (dlErr || !file) {
        console.error("[gerar-resumo-nfe-pdf] Falha ao baixar XML:", dlErr);
        return jsonResp(
          { ok: false, erro: `Storage path inválido: ${dlErr?.message ?? "arquivo não encontrado"}` },
          400,
        );
      }
      xmlContent = await file.text();
    } else {
      return jsonResp(
        { ok: false, erro: "Informe xml_content OU (storage_path + bucket)" },
        400,
      );
    }

    // Parse XML
    let nfe: NFeParsed;
    try {
      nfe = parseNFe(xmlContent);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[gerar-resumo-nfe-pdf] Falha parseando XML:", msg);
      return jsonResp({ ok: false, erro: `XML inválido: ${msg}` }, 400);
    }

    // Build PDF
    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await buildPdf(nfe);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[gerar-resumo-nfe-pdf] Falha gerando PDF:", msg);
      return jsonResp({ ok: false, erro: `Falha ao gerar PDF: ${msg}` }, 500);
    }

    const pdfBase64 = bytesToBase64(pdfBytes);

    return jsonResp({
      ok: true,
      pdf_base64: pdfBase64,
      chave_nfe: nfe.chave,
      numero_nf: nfe.numero,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[gerar-resumo-nfe-pdf] Erro inesperado:", e);
    return jsonResp({ ok: false, erro: `Erro inesperado: ${msg}` }, 500);
  }
});

// ============================================================
// Helpers
// ============================================================

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

