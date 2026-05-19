/**
 * Edge Function: processar-resumos-nfe-pendentes
 *
 * Worker da Fase B (Doutrina #16). Processa NFs em nfs_stage marcadas como
 * resumo_pdf_pendente=true:
 *   1. Chama gerar-resumo-nfe-pdf (Fase A) com o XML do storage
 *   2. Salva o PDF no bucket nfs-stage em resumos/<id>.pdf
 *   3. Insere em contas_pagar_documentos para todas as contas linkadas
 *   4. Marca resumo_pdf_gerado_em e zera resumo_pdf_pendente
 *   5. Em falha: registra em auditoria_resumo_nfe_falhas, NÃO bloqueia
 *
 * Modos:
 *   POST {} → processa lote (até LOTE_MAX) chamado pelo cron
 *   POST { nfs_stage_ids: [uuid,...] } → processa lista específica (botão UI)
 *   POST { nfs_stage_id: uuid } → atalho single-id (botão UI)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LOTE_MAX = 10;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ResultadoItem {
  nfs_stage_id: string;
  ok: boolean;
  erro?: string;
  storage_path?: string;
  documentos_inseridos?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let body: { nfs_stage_ids?: string[]; nfs_stage_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // Selecionar fila
  type Alvo = {
    id: string;
    arquivo_storage_path: string | null;
    xml_storage_path: string | null;
    nf_numero: string | null;
  };
  let alvos: Alvo[] = [];
  const SELECT_COLS = "id, arquivo_storage_path, xml_storage_path, nf_numero";

  if (body.nfs_stage_id) {
    const { data, error } = await admin
      .from("nfs_stage")
      .select(SELECT_COLS)
      .eq("id", body.nfs_stage_id)
      .single();
    if (error || !data) {
      return new Response(
        JSON.stringify({ ok: false, erro: "NFs stage não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    alvos = [data as Alvo];
  } else if (body.nfs_stage_ids?.length) {
    const { data } = await admin
      .from("nfs_stage")
      .select(SELECT_COLS)
      .in("id", body.nfs_stage_ids);
    alvos = (data || []) as Alvo[];
  } else {
    const { data } = await admin
      .from("nfs_stage")
      .select(SELECT_COLS)
      .eq("resumo_pdf_pendente", true)
      .is("resumo_pdf_gerado_em", null)
      .limit(LOTE_MAX);
    alvos = (data || []) as Alvo[];
  }

  const resultados: ResultadoItem[] = [];

  for (const alvo of alvos) {
    try {
      const xmlPath = alvo.xml_storage_path || alvo.arquivo_storage_path;
      if (!xmlPath) {
        await registrarFalha(admin, alvo.id, "sem xml_storage_path nem arquivo_storage_path");
        resultados.push({ nfs_stage_id: alvo.id, ok: false, erro: "sem storage_path" });
        continue;
      }

      // 1. Chamar Fase A
      const genResp = await fetch(
        `${SUPABASE_URL}/functions/v1/gerar-resumo-nfe-pdf`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            storage_path: xmlPath,
            bucket: "nfs-stage",
          }),
        },
      );
      const genJson = await genResp.json();
      if (!genResp.ok || !genJson.ok) {
        const msg = genJson?.erro || `HTTP ${genResp.status}`;
        await registrarFalha(admin, alvo.id, `gerar-resumo-nfe-pdf: ${msg}`);
        resultados.push({ nfs_stage_id: alvo.id, ok: false, erro: msg });
        continue;
      }

      // 2. Salvar PDF no storage
      const pdfBytes = Uint8Array.from(atob(genJson.pdf_base64), (c) => c.charCodeAt(0));
      const numeroSeguro = String(alvo.nf_numero || genJson.numero_nf || "sn").replace(/\W/g, "");
      const pdfPath = `resumos/${alvo.id}_${numeroSeguro}.pdf`;
      const { error: upErr } = await admin.storage
        .from("nfs-stage")
        .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });
      if (upErr) {
        await registrarFalha(admin, alvo.id, `upload storage: ${upErr.message}`);
        resultados.push({ nfs_stage_id: alvo.id, ok: false, erro: upErr.message });
        continue;
      }

      // 3. Inserir em contas_pagar_documentos para cada conta linkada
      const { data: contasLinkadas } = await admin
        .from("contas_pagar_receber")
        .select("id")
        .eq("nf_stage_id", alvo.id);

      let insercoes = 0;
      if (contasLinkadas?.length) {
        const docsRows = contasLinkadas.map((c) => ({
          conta_pagar_id: c.id,
          tipo: "nf",
          nome_arquivo: `resumo_nfe_${numeroSeguro}.pdf`,
          storage_path: pdfPath,
          tamanho_bytes: pdfBytes.byteLength,
        }));
        // Evitar duplicidade: deletar resumos antigos desta NF antes de inserir
        await admin
          .from("contas_pagar_documentos")
          .delete()
          .in("conta_pagar_id", contasLinkadas.map((c) => c.id))
          .like("nome_arquivo", "resumo_nfe_%");

        const { error: insErr } = await admin
          .from("contas_pagar_documentos")
          .insert(docsRows);
        if (insErr) {
          await registrarFalha(admin, alvo.id, `insert docs: ${insErr.message}`);
          resultados.push({ nfs_stage_id: alvo.id, ok: false, erro: insErr.message });
          continue;
        }
        insercoes = docsRows.length;
      }

      // 4. Marcar nfs_stage como pronto
      await admin
        .from("nfs_stage")
        .update({
          resumo_pdf_pendente: false,
          resumo_pdf_gerado_em: new Date().toISOString(),
          resumo_pdf_storage_path: pdfPath,
        })
        .eq("id", alvo.id);

      resultados.push({
        nfs_stage_id: alvo.id,
        ok: true,
        storage_path: pdfPath,
        documentos_inseridos: insercoes,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await registrarFalha(admin, alvo.id, `inesperado: ${msg}`);
      resultados.push({ nfs_stage_id: alvo.id, ok: false, erro: msg });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, processados: resultados.length, resultados }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

async function registrarFalha(admin: any, nfsStageId: string, erro: string) {
  try {
    // Conta tentativas anteriores
    const { count } = await admin
      .from("auditoria_resumo_nfe_falhas")
      .select("id", { count: "exact", head: true })
      .eq("nfs_stage_id", nfsStageId);
    await admin.from("auditoria_resumo_nfe_falhas").insert({
      nfs_stage_id: nfsStageId,
      erro: erro.slice(0, 2000),
      tentativa: (count || 0) + 1,
    });
  } catch (e) {
    console.error("[processar-resumos-nfe-pendentes] falha registrando auditoria", e);
  }
}
