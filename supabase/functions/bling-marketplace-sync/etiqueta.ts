import JSZip from "npm:jszip@3.10.1";
import { PDFDocument } from "npm:pdf-lib@1.17.1";

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

export async function extrairEtiqueta(bytes: Uint8Array) {
  if (bytes.length > 20 * 1024 * 1024) throw new Error("Arquivo de etiqueta excede 20 MB.");
  const pdfs: Uint8Array[] = [];
  const zpls: string[] = [];
  const arquivosPdf: string[] = [];
  const arquivosZpl: string[] = [];
  if (new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-") {
    pdfs.push(bytes); arquivosPdf.push("etiqueta.pdf");
  } else if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const zip = await JSZip.loadAsync(bytes);
    let total = 0;
    for (const file of Object.values(zip.files)) {
      if (file.dir || !/\.(pdf|zpl|txt)$/i.test(file.name)) continue;
      const content = await file.async("uint8array");
      total += content.length;
      if (total > 20 * 1024 * 1024) throw new Error("Conteúdo das etiquetas excede 20 MB.");
      if (/\.pdf$/i.test(file.name)) { pdfs.push(content); arquivosPdf.push(file.name); }
      else { zpls.push(new TextDecoder().decode(content)); arquivosZpl.push(file.name); }
    }
  } else {
    const text = new TextDecoder().decode(bytes);
    if (text.includes("^XA")) { zpls.push(text); arquivosZpl.push("etiqueta.zpl"); }
  }
  if (pdfs.length) {
    let pdf = pdfs[0];
    if (pdfs.length > 1) {
      const merged = await PDFDocument.create();
      for (const content of pdfs) {
        const doc = await PDFDocument.load(content);
        for (const page of await merged.copyPages(doc, doc.getPageIndices())) merged.addPage(page);
      }
      pdf = await merged.save();
    }
    return { formato: "PDF" as const, pdf_base64: base64(pdf), arquivos: arquivosPdf };
  }
  if (zpls.length) return { formato: "ZPL" as const, zpl: zpls.join("\n"), arquivos: arquivosZpl };
  throw new Error("Bling não retornou arquivos PDF ou ZPL de etiqueta.");
}

export async function baixarEtiqueta(link: string): Promise<Uint8Array> {
  const url = new URL(link);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".amazonaws.com")) throw new Error("Link de etiqueta não é uma URL S3 HTTPS válida.");
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Não foi possível baixar a etiqueta: HTTP ${response.status}. Gere novamente a etiqueta.`);
  if (Number(response.headers.get("content-length")) > 20 * 1024 * 1024) throw new Error("Arquivo de etiqueta excede 20 MB.");
  return new Uint8Array(await response.arrayBuffer());
}