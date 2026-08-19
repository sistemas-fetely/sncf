/**
 * Parser compartilhado de XML de NF-e.
 *
 * FONTE ÚNICA: usado por `ler-nf-documento` (upload manual) e por
 * `reprocessar-nf-stage` (reprocesso retroativo). Cópia divergente do parser é
 * dívida — qualquer enriquecimento entra AQUI.
 */
import { XMLParser } from "https://esm.sh/fast-xml-parser@4.4.1";

export const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

export const numOuNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export const txt = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

export const dataOuNull = (v: unknown): string | null => {
  const s = txt(v);
  if (!s) return null;
  return s.slice(0, 10);
};

export const arr = <T>(v: T | T[] | undefined | null): T[] =>
  v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];

// O nó ICMS traz um filho variável conforme o CST/CSOSN (ICMS00, ICMS10, ICMS20,
// ICMS51, ICMS60, ICMS90, ICMSSN101, ICMSSN102, ICMSSN500, ICMSSN900...).
// Pegamos o primeiro filho, qualquer que seja, e lemos os campos dele.
export function extrairIcmsLinha(det: any): {
  valor: number | null;
  aliquota: number | null;
  cst: string | null;
  origem: string | null;
} {
  const vazio = { valor: null, aliquota: null, cst: null, origem: null };
  const icms = det?.imposto?.ICMS;
  if (!icms || typeof icms !== "object") return vazio;
  const primeiro = Object.values(icms).find((v) => v && typeof v === "object") as any;
  const no = primeiro ?? icms;
  return {
    valor: numOuNull(no?.vICMS),
    aliquota: numOuNull(no?.pICMS),
    cst: txt(no?.CST ?? no?.CSOSN),
    origem: txt(no?.orig),
  };
}

export interface LinhaNfeParsed {
  item_seq: number;
  codigo_nf: string | null;
  descricao: string | null;
  ncm: string | null;
  cfop: string | null;
  unidade: string | null;
  quantidade: number | null;
  valor_unit: number | null;
  ipi_aliq: number | null;
  ipi_valor: number | null;
  icms_valor: number | null;
  icms_aliq: number | null;
  icms_cst: string | null;
  origem_mercadoria: string | null;
  valor_total: number | null;
}

export function parseXmlNfe(xmlString: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    parseTagValue: false,
    trimValues: true,
  });
  const doc = parser.parse(xmlString);

  // infNFe pode estar em nfeProc>NFe>infNFe ou NFe>infNFe
  const nfe = doc?.nfeProc?.NFe ?? doc?.NFe ?? doc?.nfeProc?.["NFe"];
  const infNFe = nfe?.infNFe;
  if (!infNFe) throw new Error("XML não parece uma NF-e: não encontrei infNFe.");

  const ide = infNFe.ide ?? {};
  const emit = infNFe.emit ?? {};
  const total = infNFe.total?.ICMSTot ?? {};
  const transp = infNFe.transp ?? {};
  const vol = arr<any>(transp.vol)[0] ?? {};
  const infCpl = txt(infNFe.infAdic?.infCpl) ?? "";

  const chave = String(infNFe["@_Id"] ?? "").replace(/^NFe/i, "") || null;

  const mCtnr = infCpl.match(/CTNR[:\s]*([A-Za-z0-9-]+)/i) ||
    infCpl.match(/CONTAINER[:\s]*([A-Za-z0-9-]+)/i) ||
    infCpl.match(/CONT[EÊ]INER[:\s]*([A-Za-z0-9-]+)/i);

  const nfRefChave =
    arr<any>(ide.NFref)
      .map((r) => txt(r?.refNFe))
      .find((v) => !!v) ?? null;

  const dets = arr<any>(infNFe.det);
  const linhas: LinhaNfeParsed[] = dets.map((det, i) => {
    const prod = det?.prod ?? {};
    const ipiTrib = det?.imposto?.IPI?.IPITrib ?? det?.imposto?.IPI?.IPINT ?? {};
    const item_seq = Number(det?.["@_nItem"] ?? i + 1);
    let icms = {
      valor: null as number | null,
      aliquota: null as number | null,
      cst: null as string | null,
      origem: null as string | null,
    };
    try {
      icms = extrairIcmsLinha(det);
    } catch (e) {
      console.error(`[parse-nfe-xml] imposto malformado no item_seq=${item_seq}:`, e);
    }
    return {
      item_seq,
      codigo_nf: txt(prod.cProd),
      descricao: txt(prod.xProd),
      ncm: txt(prod.NCM),
      cfop: txt(prod.CFOP),
      unidade: txt(prod.uCom),
      // NF-e complementar de preço tem qCom legitimamente 0,0000 — nunca inferir.
      quantidade: numOuNull(prod.qCom),
      valor_unit: numOuNull(prod.vUnCom),
      ipi_aliq: numOuNull(ipiTrib?.pIPI),
      ipi_valor: numOuNull(ipiTrib?.vIPI),
      icms_valor: icms.valor,
      icms_aliq: icms.aliquota,
      icms_cst: icms.cst,
      origem_mercadoria: icms.origem,
      valor_total: numOuNull(prod.vProd),
    };
  });

  return {
    origem: "xml" as const,
    cnpj_emitente: soDigitos(emit?.CNPJ) || null,
    nf: {
      numero: txt(ide.nNF),
      serie: txt(ide.serie),
      chave_acesso: chave,
      data_emissao: dataOuNull(ide.dhEmi ?? ide.dEmi),
      data_saida: dataOuNull(ide.dhSaiEnt ?? ide.dSaiEnt),
      container: mCtnr ? mCtnr[1] : null,
      valor_produtos: numOuNull(total.vProd),
      valor_ipi: numOuNull(total.vIPI),
      valor_total: numOuNull(total.vNF),
      valor_icms: numOuNull(total.vICMS),
      valor_pis: numOuNull(total.vPIS),
      valor_cofins: numOuNull(total.vCOFINS),
      base_icms: numOuNull(total.vBC),
      fin_nfe: numOuNull(ide.finNFe),
      nf_referenciada_chave: nfRefChave,
      natureza_operacao: txt(ide.natOp),
      peso_bruto: numOuNull(vol.pesoB),
      peso_liquido: numOuNull(vol.pesoL),
      volumes: numOuNull(vol.qVol),
    },
    linhas,
  };
}
