// CT-e XML summary, not an official DACTE. Namespace-neutral and optional-field tolerant.
import { XMLParser } from "npm:fast-xml-parser@4.5.0";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
type Node = Record<string, unknown>;
const obj = (v: unknown): Node => v && typeof v === "object" && !Array.isArray(v) ? v as Node : {};
const text = (v: unknown) => typeof v === "string" || typeof v === "number" ? String(v) : "-";
const list = (v: unknown): Node[] => (Array.isArray(v) ? v : v ? [v] : []).map(obj);
const money = (v: unknown) => v == null ? "-" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const party = (v: unknown) => { const p = obj(v), e = obj(p.enderEmit ?? p.enderReme ?? p.enderDest ?? p.enderExped ?? p.enderReceb ?? p.enderToma); return `${text(p.xNome)} · CNPJ/CPF ${text(p.CNPJ ?? p.CPF)} · IE ${text(p.IE)} · UF ${text(e.UF)}`; };
export function linhasResumoCte(xml: string): string[] {
  const parsed = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, parseAttributeValue: false }).parse(xml);
  const root = obj(parsed), cte = obj(obj(root.cteProc).CTe ?? root.CTe), inf = obj(cte.infCte);
  if (!Object.keys(inf).length) throw new Error("estrutura não reconhecida como CT-e: infCte ausente");
  const ide = obj(inf.ide), normal = obj(inf.infCTeNorm), prest = obj(inf.vPrest), carga = obj(normal.infCarga);
  const icms = obj(obj(inf.imp).ICMS), tax = obj(Object.values(icms)[0]);
  const toma3 = obj(ide.toma3), toma4 = obj(ide.toma4), papel = text(toma3.toma ?? toma4.toma);
  const tomadores: Record<string, unknown> = { "0": inf.rem, "1": inf.exped, "2": inf.receb, "3": inf.dest, "4": toma4 };
  const linhas = [
    "Resumo CT-e — gerado automaticamente a partir do XML; não substitui o DACTE",
    `Chave: ${text(inf["@_Id"]).replace(/^CTe/, "")}`,
    `Número/série: ${text(ide.nCT)}/${text(ide.serie)} · Emissão ${text(ide.dhEmi ?? ide.dEmi)}`,
    `CFOP ${text(ide.CFOP)} · Natureza ${text(ide.natOp)} · Modal ${text(ide.modal ?? obj(normal.infModal)["@_versaoModal"])}`,
    "EMITENTE (TRANSPORTADORA)", party(inf.emit), "REMETENTE", party(inf.rem), "DESTINATÁRIO", party(inf.dest),
    ...(inf.exped ? ["EXPEDIDOR", party(inf.exped)] : []), ...(inf.receb ? ["RECEBEDOR", party(inf.receb)] : []),
    "TOMADOR", party(tomadores[papel]),
    `Origem → destino: ${text(ide.xMunIni)}/${text(ide.UFIni)} → ${text(ide.xMunFim)}/${text(ide.UFFim)}`,
    "VALORES", `Total da prestação: ${money(prest.vTPrest)} · Valor a receber: ${money(prest.vRec)}`,
    ...list(prest.Comp).map(c => `Componente: ${text(c.xNome)} · ${money(c.vComp)}`),
    "ICMS", `CST ${text(tax.CST)} · Base ${money(tax.vBC)} · Alíquota ${text(tax.pICMS)}% · Valor ${money(tax.vICMS)}`,
    "CARGA", `Produto predominante: ${text(carga.proPred)} · Valor da carga: ${money(carga.vCarga)}`,
    ...list(carga.infQ).map(q => `${text(q.tpMed)}: ${text(q.qCarga)} · Unidade ${text(q.cUnid)}`),
    "NF-e REFERENCIADAS", ...list(obj(normal.infDoc).infNFe).map(n => text(n.chave)),
    "OBSERVAÇÕES", text(obj(inf.compl).xObs), ...list(obj(inf.compl).ObsCont).map(o => `${text(o["@_xCampo"])}: ${text(o.xTexto)}`),
  ];
  return linhas;
}
export async function gerarResumoCtePdf(xml: string): Promise<Uint8Array> {
  const linhas = linhasResumoCte(xml), pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]), y = 800;
  for (const [i, raw] of linhas.entries()) {
    const safe = raw.replace(/[—–→]/g, "-").replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "?");
    for (const block of safe.split("\n")) {
      for (let j = 0; j < Math.max(block.length, 1); j += 100) {
        if (y < 40) { page = pdf.addPage([595, 842]); y = 800; }
        page.drawText(block.slice(j, j + 100), { x: 36, y, size: i === 0 ? 10 : 9, font: i === 0 || /^[A-ZÁÓÇ -]+$/.test(raw) ? bold : font }); y -= 13;
      }
    }
    if (i === 0) { page.drawLine({ start: { x: 36, y: y + 4 }, end: { x: 559, y: y + 4 }, thickness: 0.5, color: rgb(.5, .5, .5) }); y -= 6; }
  }
  return await pdf.save();
}
