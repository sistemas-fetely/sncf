// Resumo de NFS-e em PDF gerado do XML guardado (a Qive não entrega o PDF oficial).
// Mesmo princípio do Resumo NF-e (`nfe-resumo-pdf.ts`): identifica que é gerado do XML.
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { parseNfseXml } from "./nfse-xml.ts";
import { retencoesDoXml } from "./nfse-retencoes.ts";

const latin1 = (s: string) => s.replace(/[—–]/g, "-").replace(/[×]/g, "x").replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "?");
const brl = (v: number | null | undefined) => v == null ? "-" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const doc = (c: string | null) => c && c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : (c ?? "-");
const dataBr = (d: string | null) => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "-";

export async function gerarResumoNfsePdf(xml: string): Promise<Uint8Array> {
  const p = parseNfseXml(xml);
  const r = retencoesDoXml(xml);
  const pdf = await PDFDocument.create();
  const f = await pdf.embedFont(StandardFonts.Helvetica), b = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]); let y = 800;
  const linha = (t: string, bold = false, size = 9) => {
    let s = latin1(t);
    const partes: string[] = [];
    for (const bloco of s.split("\n")) { let l = bloco; while (l.length > 100) { partes.push(l.slice(0, 100)); l = l.slice(100); } partes.push(l); }
    for (const pt of partes) { if (y < 40) { page = pdf.addPage([595, 842]); y = 800; } page.drawText(pt, { x: 36, y, size, font: bold ? b : f }); y -= size + 4; }
    s = "";
  };
  linha("RESUMO DE NFS-e - gerado pelo SNCF a partir do XML (não substitui o documento oficial)", true, 10);
  page.drawLine({ start: { x: 36, y: y + 6 }, end: { x: 559, y: y + 6 }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) }); y -= 6;
  linha(`NFS-e nº ${p.numero ?? "-"} · Emissão ${dataBr(p.data_emissao)} · Layout ${p.layout}`, true);
  linha(`Chave/identificação: ${p.chave ?? "-"}`);
  y -= 4;
  linha("PRESTADOR", true); linha(`${p.prestador_razao ?? "-"} · CNPJ ${doc(p.prestador_cnpj)}`);
  linha("TOMADOR", true); linha(`CNPJ ${doc(p.tomador_cnpj)}`);
  y -= 4;
  linha("VALORES", true);
  linha(`Valor bruto dos serviços: ${brl(r.bruto)}`);
  linha(`IR retido: ${brl(r.ir)} · PIS: ${brl(r.pis)} · COFINS: ${brl(r.cofins)} · CSLL: ${brl(r.csll)}`);
  linha(`INSS retido: ${brl(r.inss)}${r.inss_aliquota != null ? ` (${r.inss_aliquota}%)` : ""} · ISS retido: ${brl(r.iss_retido)}`);
  linha(`Valor líquido calculado: ${brl(r.liquido)}${r.liquido_xml != null ? ` · Líquido informado no XML: ${brl(r.liquido_xml)}` : ""}`);
  for (const o of r.observacoes) linha(`Obs.: ${o}`);
  y -= 4;
  linha("DISCRIMINAÇÃO", true); linha(p.descricao ?? "-");
  return await pdf.save();
}
