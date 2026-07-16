/**
 * Dispatcher unificado de XML fiscal.
 *
 * Detecta tipo do XML (NF-e produto, NFS-e ABRASF ou CT-e) e chama o
 * parser correspondente. Frontend usa esta função sempre que
 * receber um arquivo .xml — não precisa saber o tipo.
 */

import type { NFParsed } from "./types";
import { parseNFeXml } from "./xml-nfe-parser";
import { parseNFSeXml, isXmlNFSeAbrasf } from "./xml-nfse-parser";
import { parseCteXml, isXmlCte } from "./xml-cte-parser";

export type TipoXmlDetectado = "nfe" | "nfse" | "cte" | "desconhecido";

export function detectarTipoXml(xmlString: string): TipoXmlDetectado {
  if (!xmlString) return "desconhecido";

  if (isXmlNFSeAbrasf(xmlString)) return "nfse";
  if (isXmlCte(xmlString)) return "cte";

  const lower = xmlString.toLowerCase();
  if (
    lower.includes("portalfiscal.inf.br/nfe") &&
    (lower.includes("<nfe") || lower.includes("<nfeproc"))
  ) {
    return "nfe";
  }

  return "desconhecido";
}

export function parseXmlAny(xmlString: string): NFParsed | null {
  const tipo = detectarTipoXml(xmlString);

  if (tipo === "nfe") {
    const nf = parseNFeXml(xmlString);
    if (!nf) return null;
    return {
      ...nf,
      tipo_documento: "nfe",
      pais_emissor: "BR",
      moeda: "BRL",
    } as NFParsed;
  }

  if (tipo === "nfse") {
    const nf = parseNFSeXml(xmlString);
    if (!nf) return null;
    return {
      ...nf,
      tipo_documento: "nfse",
      pais_emissor: "BR",
      moeda: "BRL",
    } as NFParsed;
  }

  if (tipo === "cte") {
    const nf = parseCteXml(xmlString);
    if (!nf) return null;
    return nf;
  }

  return null;
}
