import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { parseNFe, buildPdf } from "../nfe-resumo-pdf.ts";
import { gerarResumoNfsePdf } from "../nfse-resumo-pdf.ts";
import { gerarResumoCtePdf } from "../cte-resumo-pdf.ts";
export type EntradaResumoRow = { id: string; tipo_documento: string | null; xml_storage_path: string | null };
export async function pdfResumoEntrada(tipo: string | null, xml: string): Promise<Uint8Array> {
  if (tipo === "nfe") return await buildPdf(parseNFe(xml));
  if (tipo === "cte") return await gerarResumoCtePdf(xml);
  if (tipo === "nfse") return await gerarResumoNfsePdf(xml);
  throw new Error("tipo sem resumo");
}
export async function gerarResumoEntrada(admin: SupabaseClient, row: EntradaResumoRow): Promise<string> {
  if (!row.xml_storage_path) throw new Error("XML não guardado");
  if (!["nfe", "cte", "nfse"].includes(row.tipo_documento ?? "")) throw new Error("tipo sem resumo");
  let xml = "", ultimo = "vazio";
  for (let t = 0; t < 3 && !xml; t++) {
    try {
      const { data, error } = await admin.storage.from("contabil").download(row.xml_storage_path);
      if (error) ultimo = error.message; else if (data) xml = await data.text();
    } catch (e) { ultimo = e instanceof Error ? e.message : String(e); }
    if (!xml && t < 2) await new Promise(r => setTimeout(r, 400 * (t + 1)));
  }
  if (!xml) throw new Error(`XML não lido: ${ultimo}`);
  const pdf = await pdfResumoEntrada(row.tipo_documento, xml);
  const path = row.xml_storage_path.replace(/\.xml$/i, "") + ".pdf";
  const { error: up } = await admin.storage.from("contabil").upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (up) throw new Error(`upload do PDF: ${up.message}`);
  const { error } = await admin.from("nfs_stage").update({ resumo_pdf_storage_path: path, resumo_pdf_gerado_em: new Date().toISOString(), resumo_pdf_pendente: false }).eq("id", row.id);
  if (error) throw new Error(error.message);
  return path;
}
