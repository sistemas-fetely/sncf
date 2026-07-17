/**
 * Parser de XML NF-e v4.00 (frontend, DOMParser)
 */

import type { ItemNFParsed, NFParsed } from "./types";
import { mapearMeioPagamentoXml } from "./parsers";

const NFE_NS = "http://www.portalfiscal.inf.br/nfe";

function tag(parent: Element | null | undefined, name: string): string {
  if (!parent) return "";
  const el =
    parent.getElementsByTagNameNS(NFE_NS, name)[0] ||
    parent.getElementsByTagName(name)[0];
  return el ? (el.textContent || "").trim() : "";
}

function firstChild(parent: Element | Document | null, name: string): Element | null {
  if (!parent) return null;
  const el =
    (parent as any).getElementsByTagNameNS?.(NFE_NS, name)[0] ||
    (parent as any).getElementsByTagName?.(name)[0];
  return (el as Element) || null;
}

export function parseNFeXml(xmlString: string): NFParsed | null {
  if (!xmlString || !xmlString.trim()) return null;

  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "text/xml");

  // Erro de parse
  if (doc.getElementsByTagName("parsererror").length > 0) return null;

  const nfe = firstChild(doc, "NFe");
  if (!nfe) return null;

  const ide = firstChild(nfe, "ide");
  const emit = firstChild(nfe, "emit");
  const total = firstChild(nfe, "total");
  const icmsTot = total ? firstChild(total, "ICMSTot") : null;
  const infProt = firstChild(doc, "infProt");

  const chave =
    (infProt ? tag(infProt, "chNFe") : "") ||
    // alguns XMLs trazem só o Id da infNFe (NFe + 44 dígitos)
    (() => {
      const inf = firstChild(nfe, "infNFe") as Element | null;
      const id = inf?.getAttribute("Id") || "";
      return id.replace(/^NFe/, "");
    })();

  // Pagamento
  const pag = firstChild(nfe, "pag");
  const detPag = pag ? firstChild(pag, "detPag") : null;
  const tPag = detPag ? tag(detPag, "tPag") : "";

  // Itens
  const detList = (nfe as any).getElementsByTagNameNS
    ? Array.from((nfe as any).getElementsByTagNameNS(NFE_NS, "det") as HTMLCollectionOf<Element>)
    : [];
  const dets: Element[] = detList.length
    ? detList
    : Array.from(nfe.getElementsByTagName("det"));

  const itens: ItemNFParsed[] = dets.map((det) => {
    const prod = firstChild(det, "prod");
    return {
      codigo_produto: tag(prod, "cProd"),
      descricao: tag(prod, "xProd"),
      ncm: tag(prod, "NCM"),
      cfop: tag(prod, "CFOP"),
      unidade: tag(prod, "uCom"),
      quantidade: parseFloat(tag(prod, "qCom")) || 0,
      valor_unitario: parseFloat(tag(prod, "vUnCom")) || 0,
      valor_total: parseFloat(tag(prod, "vProd")) || 0,
    };
  });

  // NCM principal: item de maior valor
  let ncmPrincipal = "";
  if (itens.length > 0) {
    const principal = itens.reduce((a, b) =>
      (a.valor_total || 0) > (b.valor_total || 0) ? a : b
    );
    ncmPrincipal = principal.ncm || "";
  }

  // Grupo <cobr> (fatura + duplicatas) — opcional na NF-e
  const cobr = firstChild(nfe, "cobr");
  let duplicatas: NFParsed["duplicatas"] = null;
  if (cobr) {
    const fatEl = firstChild(cobr, "fat");
    const fat = fatEl
      ? {
          nFat: tag(fatEl, "nFat"),
          vOrig: parseFloat(tag(fatEl, "vOrig")) || 0,
          vDesc: parseFloat(tag(fatEl, "vDesc")) || 0,
          vLiq: parseFloat(tag(fatEl, "vLiq")) || 0,
        }
      : null;
    const dupNodes = (cobr as any).getElementsByTagNameNS
      ? Array.from(
          (cobr as any).getElementsByTagNameNS(NFE_NS, "dup") as HTMLCollectionOf<Element>,
        )
      : [];
    const dupList: Element[] = dupNodes.length
      ? (dupNodes as Element[])
      : Array.from(cobr.getElementsByTagName("dup"));
    const dup = dupList.map((d) => ({
      nDup: tag(d, "nDup"),
      dVenc: tag(d, "dVenc"),
      vDup: parseFloat(tag(d, "vDup")) || 0,
    }));
    duplicatas = { fat, dup };
  }

  const dhEmi = tag(ide, "dhEmi") || tag(ide, "dEmi");
  const dataEmissao = dhEmi ? dhEmi.substring(0, 10) : null;

  return {
    nf_chave_acesso: chave || undefined,
    nf_numero: tag(ide, "nNF"),
    nf_serie: tag(ide, "serie"),
    nf_data_emissao: dataEmissao,
    nf_natureza_operacao: tag(ide, "natOp"),
    nf_cfop: itens.length > 0 ? itens[0].cfop : "",
    nf_ncm: ncmPrincipal,
    fornecedor_nome: tag(emit, "xNome"),
    fornecedor_cnpj: tag(emit, "CNPJ").replace(/\D/g, ""),
    valor: parseFloat(icmsTot ? tag(icmsTot, "vNF") : "0") || 0,
    nf_valor_produtos: parseFloat(icmsTot ? tag(icmsTot, "vProd") : "0") || 0,
    nf_valor_impostos: parseFloat(icmsTot ? tag(icmsTot, "vTotTrib") : "0") || 0,
    meio_pagamento: mapearMeioPagamentoXml(tPag),
    itens,
    duplicatas,
    _source: "xml_nfe",
  };
}
