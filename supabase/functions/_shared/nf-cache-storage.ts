// Cache permanente de XML/PDF das NFs de saída no bucket privado `contabil`.
// O Bling só entrega links assinados que expiram (~48h); o pacote do contador
// precisa dos bytes, então eles são copiados para nfs/<AAAA-MM>/saida/.
// Resolução de link + validação de bytes vivem em _shared/bling/nf-anexo.ts.
import { resolverLinkPdfFresco, baixarPdfValidado, validarXmlNf } from "./bling/nf-anexo.ts";
import { gerarResumoNfePdf } from "./nfe-resumo-pdf.ts";

export const BUCKET_CONTABIL = "contabil";

export type NfCacheRow = {
  id: string;
  bling_id: string | null;
  numero: string | null;
  serie: string | null;
  pdf_url: string | null;
  xml_url: string | null;
  data_emissao: string | null;
  situacao: string | null;
};

export function caminhoNfSaida(nf: NfCacheRow, ext: "xml" | "pdf"): string {
  const comp = (nf.data_emissao ?? "").slice(0, 7) || "sem-data";
  const num = String(nf.numero ?? nf.id).replace(/[^0-9A-Za-z-]/g, "");
  const serie = String(nf.serie ?? "0").replace(/[^0-9A-Za-z-]/g, "");
  return `nfs/${comp}/saida/${num}-${serie}.${ext}`;
}

/** Baixa XML e PDF, grava no Storage e marca a NF. Lança com a mensagem real. */
export async function cachearNfSaida(supabase: any, nf: NfCacheRow) {
  const ctx = { nf_id: nf.id, numero: nf.numero };
  const link = await resolverLinkPdfFresco(supabase, null, nf);
  // XML primeiro: é o documento fiscal que o contador escritura. O PDF (DANFE)
  // é complemento — se o Bling recusar, o XML fica guardado e o erro registrado.
  const xmlUrl = link.xml ?? nf.xml_url;
  if (!xmlUrl) throw new Error(`NF ${nf.numero}: Bling não informou o link do XML`);
  let corpoXml = xmlUrl;
  if (xmlUrl.startsWith("http")) {
    const resXml = await fetch(xmlUrl);
    corpoXml = await resXml.text();
    if (!resXml.ok) throw new Error(`NF ${nf.numero}: download do XML falhou [${resXml.status}]: ${corpoXml.slice(0, 200)}`);
  }
  const xml = validarXmlNf(corpoXml, ctx);
  const pathXml = caminhoNfSaida(nf, "xml");
  const up2 = await supabase.storage.from(BUCKET_CONTABIL)
    .upload(pathXml, new TextEncoder().encode(xml), { contentType: "application/xml", upsert: true });
  if (up2.error) throw new Error(`NF ${nf.numero}: upload do XML falhou: ${up2.error.message}`);

  // PDF: tenta o DANFE oficial do Bling. O site do Bling recusa (HTTP 403) os
  // downloads vindos do servidor de funções (bloqueio por origem — do sandbox
  // o mesmo link entrega o PDF), então o fallback é o Resumo NF-e gerado do XML.
  let pathPdf: string | null = null;
  let pdfOrigem: "bling" | "gerado_xml" | null = null;
  let erroPdf: string | null = null;
  const p = caminhoNfSaida(nf, "pdf");
  let pdf: Uint8Array | null = null;
  let falhaBling: string | null = null;
  try {
    pdf = await baixarPdfValidado(link.url, link.origem, ctx);
    pdfOrigem = "bling";
  } catch (e) {
    falhaBling = e instanceof Error ? e.message : String(e);
    try {
      pdf = await gerarResumoNfePdf(xml);
      pdfOrigem = "gerado_xml";
    } catch (e2) {
      erroPdf = `PDF: Bling (${falhaBling}); gerar do XML (${e2 instanceof Error ? e2.message : String(e2)})`;
    }
  }
  if (pdf) {
    const up1 = await supabase.storage.from(BUCKET_CONTABIL)
      .upload(p, pdf, { contentType: "application/pdf", upsert: true });
    if (up1.error) { erroPdf = `PDF: upload falhou: ${up1.error.message}`; pdfOrigem = null; }
    else pathPdf = p;
  }

  const { error } = await supabase.from("nfs_emitidas").update({
    pdf_storage_path: pathPdf,
    pdf_origem: pdfOrigem,
    xml_storage_path: pathXml,
    arquivos_sincronizados_em: new Date().toISOString(),
    arquivos_erro: erroPdf,
  }).eq("id", nf.id);
  if (error) throw new Error(`NF ${nf.numero}: arquivos guardados, mas a marcação falhou: ${error.message}`);
  return { pdf: pathPdf, xml: pathXml, erroPdf, pdfOrigem, falhaBling };
}
