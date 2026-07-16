/**
 * Parser de XML CT-e v4.00 (frontend, DOMParser).
 *
 * Espelha o formato do xml-nfse-parser: exporta detectores + parser
 * retornando NFParsed. Cobertura: CT-e nacional (portalfiscal cte).
 *
 * O CT-e representa o frete contratado. Quando a Fetely é tomadora
 * (toma3=remetente/exped/receb/destinatário ou toma4 explícito), o
 * documento vira uma despesa no NFs Stage.
 */

import type { ItemNFParsed, NFParsed } from "./types";

const CTE_NS = "http://www.portalfiscal.inf.br/cte";

function tag(parent: Element | null | undefined, name: string): string {
  if (!parent) return "";
  const el =
    parent.getElementsByTagNameNS(CTE_NS, name)[0] ||
    parent.getElementsByTagName(name)[0];
  return el ? (el.textContent || "").trim() : "";
}

function firstChild(parent: Element | Document | null, name: string): Element | null {
  if (!parent) return null;
  const el =
    (parent as any).getElementsByTagNameNS?.(CTE_NS, name)[0] ||
    (parent as any).getElementsByTagName?.(name)[0];
  return (el as Element) || null;
}

export function isXmlCte(xmlString: string): boolean {
  if (!xmlString) return false;
  const lower = xmlString.toLowerCase();
  if (lower.includes("portalfiscal.inf.br/cte")) return true;
  if (lower.includes("<infcte") || lower.includes(":infcte")) return true;
  return false;
}

function parseDoc(xmlString: string): Document | null {
  if (!xmlString || !xmlString.trim()) return null;
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "text/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) return null;
  return doc;
}

/**
 * Resolve o CNPJ do tomador do frete.
 * - Se existir <toma4>, retorna o CNPJ contido nele.
 * - Senão lê <toma3><toma>N</toma></toma3>:
 *     0=rem, 1=exped, 2=receb, 3=dest — retorna o CNPJ do bloco correspondente.
 * Retorna apenas dígitos.
 */
export function getCteTomadorCnpj(xmlString: string): string | null {
  const doc = parseDoc(xmlString);
  if (!doc) return null;

  const cte = firstChild(doc, "CTe") || firstChild(doc, "cteProc");
  const infCte = firstChild(cte, "infCte") || firstChild(doc, "infCte");
  if (!infCte) return null;
  const ide = firstChild(infCte, "ide");
  if (!ide) return null;

  const toma4 = firstChild(ide, "toma4");
  if (toma4) {
    const cnpj = tag(toma4, "CNPJ");
    if (cnpj) return cnpj.replace(/\D/g, "");
  }

  const toma3 = firstChild(ide, "toma3");
  const tomaCode = toma3 ? tag(toma3, "toma") : tag(ide, "toma");
  const map: Record<string, string> = {
    "0": "rem",
    "1": "exped",
    "2": "receb",
    "3": "dest",
  };
  const blocoName = map[tomaCode];
  if (!blocoName) return null;

  const bloco = firstChild(infCte, blocoName);
  if (!bloco) return null;
  const cnpj = tag(bloco, "CNPJ");
  return cnpj ? cnpj.replace(/\D/g, "") : null;
}

export function parseCteXml(xmlString: string): NFParsed | null {
  const doc = parseDoc(xmlString);
  if (!doc) return null;
  if (!isXmlCte(xmlString)) return null;

  const cte = firstChild(doc, "CTe") || firstChild(doc, "cteProc");
  const infCte = firstChild(cte, "infCte") || firstChild(doc, "infCte");
  if (!infCte) return null;

  const ide = firstChild(infCte, "ide");
  const emit = firstChild(infCte, "emit");
  const vPrest = firstChild(infCte, "vPrest");

  const nCT = tag(ide, "nCT");
  const serie = tag(ide, "serie");
  const dhEmi = tag(ide, "dhEmi");
  const dataEmissao = dhEmi ? dhEmi.substring(0, 10) : null;

  const emitCnpj = tag(emit, "CNPJ").replace(/\D/g, "");
  const emitNome = tag(emit, "xNome");

  if (!emitCnpj && !emitNome) return null;

  const valor = parseFloat(tag(vPrest, "vTPrest")) || 0;

  const idAttr = (infCte as Element).getAttribute("Id") || "";
  const chave = idAttr.replace(/^CTe/i, "").replace(/\D/g, "").slice(-44);

  const descricao = `Frete CTe ${nCT} - ${emitNome}`;

  const itens: ItemNFParsed[] = [
    {
      codigo_produto: "",
      descricao,
      ncm: "",
      cfop: tag(ide, "CFOP"),
      unidade: "SV",
      quantidade: 1,
      valor_unitario: valor,
      valor_total: valor,
    },
  ];

  return {
    nf_chave_acesso: chave || undefined,
    nf_numero: nCT,
    nf_serie: serie,
    nf_data_emissao: dataEmissao,
    nf_natureza_operacao: descricao,
    nf_cfop: tag(ide, "CFOP"),
    nf_ncm: "",
    fornecedor_nome: emitNome,
    fornecedor_cnpj: emitCnpj || undefined,
    valor,
    nf_valor_produtos: valor,
    nf_valor_impostos: 0,
    itens,
    tipo_documento: "cte",
    pais_emissor: "BR",
    moeda: "BRL",
    _source: "xml_nfe",
  } as NFParsed;
}
