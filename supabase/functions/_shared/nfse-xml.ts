// Parser de XML de NFS-e (puro, sem DOM) — usado pela captura Qive (sync-qive-dfe).
// CONVENÇÃO DE CHAVE = a do upload manual (`src/lib/financeiro/xml-nfse-parser.ts`, fonte xml_nfse):
//   1) atributo Id da infNFSe/InfNfse quando existe (padrão nacional ADN: "NFS" + 50 dígitos);
//   2) senão síntese "NFSE-<cnpj_prestador>-<numero>-<AAAA-MM-DD>" com a data crua (slice 0..10),
// para que a mesma nota, vinda do upload ou da Qive, gere a MESMA chave.
// Testado por vitest em src/lib/financeiro/nfseXmlCompartilhado.test.ts.

export interface NfseParsed {
  layout: "nacional" | "abrasf" | "sp" | "generico";
  chave: string | null;
  numero: string | null;
  data_emissao: string | null;
  prestador_cnpj: string | null;
  prestador_razao: string | null;
  tomador_cnpj: string | null;
  valor: number | null;
  descricao: string | null;
}

const semNs = (xml: string) => xml.replace(/<(\/?)[A-Za-z0-9_]+:/g, "<$1");
const bloco = (xml: string, nome: string): string =>
  xml.match(new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${nome}>`))?.[1] ?? "";
const tag = (xml: string, ...nomes: string[]): string | null => {
  for (const n of nomes) {
    const v = xml.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${n}>`))?.[1]?.trim();
    if (v) return v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
  }
  return null;
};
const docId = (b: string) => tag(b, "CNPJ", "Cnpj", "CPF", "Cpf")?.replace(/\D/g, "") || null;
const num = (v: string | null): number | null => {
  if (!v) return null;
  const s = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const sintetica = (cnpj: string | null, numero: string | null, data: string | null) =>
  cnpj && numero && data ? `NFSE-${cnpj}-${numero}-${data.slice(0, 10)}` : null;

export function parseNfseXml(xmlBruto: string): NfseParsed {
  const xml = semNs(xmlBruto);

  // a) Padrão nacional (ADN)
  const idNac = xml.match(/<infNFSe[^>]*\sId\s*=\s*"(NFS\d{50})"/)?.[1];
  if (idNac || /<infNFSe[\s>]/.test(xml)) {
    const inf = bloco(xml, "infNFSe") || xml;
    const emit = bloco(inf, "emit");
    const toma = bloco(xml, "toma");
    const numero = tag(inf, "nNFSe");
    const dh = tag(inf, "dhProc") ?? tag(xml, "dhEmi");
    const cnpj = docId(emit);
    return {
      layout: "nacional",
      chave: idNac ?? sintetica(cnpj, numero, dh),
      numero, data_emissao: dh ? dh.slice(0, 10) : null,
      prestador_cnpj: cnpj, prestador_razao: tag(emit, "xNome"),
      tomador_cnpj: docId(toma),
      valor: num(tag(xml, "vLiq")) ?? num(tag(xml, "vServ")),
      descricao: tag(xml, "xDescServ"),
    };
  }

  // b1) ABRASF (CompNfse/InfNfse)
  if (/<InfNfse[\s>]/.test(xml)) {
    const inf = bloco(xml, "InfNfse");
    const idAttr = xml.match(/<InfNfse[^>]*\sId\s*=\s*"([^"]+)"/)?.[1]?.trim() || null;
    const prest = bloco(inf, "PrestadorServico") || bloco(inf, "Prestador");
    const ident = bloco(prest, "IdentificacaoPrestador") || prest;
    const toma = bloco(xml, "TomadorServico") || bloco(xml, "Tomador");
    const numero = tag(inf, "Numero");
    const data = tag(inf, "DataEmissao") ?? tag(xml, "DataEmissao");
    const cnpj = docId(ident) ?? docId(prest);
    return {
      layout: "abrasf",
      chave: idAttr ?? sintetica(cnpj, numero, data),
      numero, data_emissao: data ? data.slice(0, 10) : null,
      prestador_cnpj: cnpj, prestador_razao: tag(prest, "RazaoSocial", "NomeFantasia"),
      tomador_cnpj: docId(bloco(toma, "IdentificacaoTomador") || toma),
      valor: num(tag(inf, "ValorLiquidoNfse")) ?? num(tag(xml, "ValorServicos")),
      descricao: tag(xml, "Discriminacao"),
    };
  }

  // b2) São Paulo capital (NFe / ChaveNFe) e genérico
  const sp = /<ChaveNFe[\s>]/.test(xml) && /<NumeroNFe[\s>]/.test(xml);
  const prestBloco = bloco(xml, "CPFCNPJPrestador") || bloco(xml, "ChaveNFe") || bloco(xml, "Prestador") || bloco(xml, "PrestadorServico");
  const cnpj = sp ? (tag(bloco(xml, "CPFCNPJPrestador"), "CNPJ", "CPF") ?? tag(xml, "InscricaoPrestador"))?.replace(/\D/g, "") || null : docId(prestBloco);
  const numero = sp ? tag(bloco(xml, "ChaveNFe"), "NumeroNFe") : tag(xml, "NumeroNfse", "NumeroNFe", "Numero");
  const data = tag(xml, "DataEmissaoNFe", "DataEmissao", "DataEmissaoNfse", "dhEmi");
  return {
    layout: sp ? "sp" : "generico",
    chave: sintetica(cnpj, numero, data),
    numero, data_emissao: data ? data.slice(0, 10) : null,
    prestador_cnpj: cnpj,
    prestador_razao: tag(xml, "RazaoSocialPrestador", "RazaoSocial"),
    tomador_cnpj: sp ? (tag(bloco(xml, "CPFCNPJTomador"), "CNPJ", "CPF") ?? null) : docId(bloco(xml, "Tomador") || bloco(xml, "TomadorServico")),
    valor: num(tag(xml, "ValorLiquidoNfse", "ValorLiquido")) ?? num(tag(xml, "ValorServicos")),
    descricao: tag(xml, "Discriminacao", "xDescServ"),
  };
}
