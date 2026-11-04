// Retenções de NFS-e tomada (puro, sem DOM) — usado pelo Pacote do Contador (planilha
// "Pagamentos das Notas Fiscais de Serviços Tomados") e pela tela do pacote.
// Regra 4,65% (decisão Flávio 04/11/2026): prestadores que lançam PIS+COFINS+CSLL somados no
// campo de CSLL (PIS/COFINS zerados) têm o valor separado em PIS 0,65% · COFINS 3% · CSLL 1%
// quando o campo bate com 4,65% do bruto (tolerância R$ 0,02); senão fica como veio e a
// Observação pede conferência. Testado em src/lib/contabil/nfseRetencoes.test.ts.

export interface RetencoesNfse {
  bruto: number;
  ir: number;
  pis: number;
  cofins: number;
  csll: number;
  inss: number;
  inss_aliquota: number | null; // em %, ex. 11 ou 3.5
  iss_retido: number;
  liquido: number; // bruto − retenções federais/INSS/ISS retido
  liquido_xml: number | null;
  tem_retencao: boolean;
  observacoes: string[];
}

export const OBS_SOMADOS = "PIS/COFINS/CSLL vieram somados no campo CSLL da NFS-e";
export const OBS_CONFERIR = "conferir retenções";
const TOL_465 = 0.02;

const semNs = (xml: string) => xml.replace(/<(\/?)[A-Za-z0-9_]+:/g, "<$1");
const tag = (xml: string, ...nomes: string[]): string | null => {
  for (const n of nomes) {
    const v = xml.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${n}>`))?.[1]?.trim();
    if (v) return v;
  }
  return null;
};
const num = (v: string | null): number => {
  if (!v) return 0;
  const s = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Lê os valores como vieram no XML (ADN nacional, ABRASF, São Paulo). */
export function lerValoresNfse(xmlBruto: string) {
  const x = semNs(xmlBruto);
  const nacional = /<infNFSe[\s>]/.test(x);
  if (nacional) {
    const pisCofinsRetido = ["1", "3"].includes(tag(x, "tpRetPisCofins") ?? "");
    return {
      bruto: num(tag(x, "vServ")),
      ir: num(tag(x, "vRetIRRF")),
      pis: pisCofinsRetido ? num(tag(x, "vPis", "vPIS")) : 0,
      cofins: pisCofinsRetido ? num(tag(x, "vCofins", "vCOFINS")) : 0,
      csll: num(tag(x, "vRetCSLL")),
      inss: num(tag(x, "vRetCP")),
      iss_retido: tag(x, "tpRetISSQN") === "2" ? num(tag(x, "vISSQN")) : 0,
      liquido_xml: tag(x, "vLiq") ? num(tag(x, "vLiq")) : null,
    };
  }
  const issRetidoFlag = tag(x, "IssRetido", "ISSRetido");
  const issRet = num(tag(x, "ValorIssRetido"));
  return {
    bruto: num(tag(x, "ValorServicos")),
    ir: num(tag(x, "ValorIr", "ValorIR")),
    pis: num(tag(x, "ValorPis", "ValorPIS")),
    cofins: num(tag(x, "ValorCofins", "ValorCOFINS")),
    csll: num(tag(x, "ValorCsll", "ValorCSLL")),
    inss: num(tag(x, "ValorInss", "ValorINSS")),
    iss_retido: issRet || (issRetidoFlag === "1" || issRetidoFlag === "true" ? num(tag(x, "ValorIss", "ValorISS")) : 0),
    liquido_xml: tag(x, "ValorLiquidoNfse", "ValorLiquido") ? num(tag(x, "ValorLiquidoNfse", "ValorLiquido")) : null,
  };
}

/** Aplica a regra 4,65% e calcula o líquido. */
export function calcularRetencoes(v: ReturnType<typeof lerValoresNfse>): RetencoesNfse {
  const obs: string[] = [];
  let { pis, cofins, csll } = v;
  if (pis === 0 && cofins === 0 && csll > 0 && v.bruto > 0) {
    if (r2(Math.abs(csll - v.bruto * 0.0465)) <= TOL_465) {
      const total = csll;
      pis = r2(v.bruto * 0.0065);
      cofins = r2(v.bruto * 0.03);
      csll = r2(total - pis - cofins); // preserva o total retido da nota
      obs.push(OBS_SOMADOS);
    } else if (r2(Math.abs(csll - v.bruto * 0.01)) > TOL_465) {
      obs.push(OBS_CONFERIR);
    }
  }
  const inssAliq = v.inss > 0 && v.bruto > 0 ? r2((v.inss / v.bruto) * 100) : null;
  const inss_aliquota = inssAliq == null ? null : Math.abs(inssAliq - 11) < 0.05 ? 11 : Math.abs(inssAliq - 3.5) < 0.05 ? 3.5 : inssAliq;
  if (inss_aliquota != null && inss_aliquota !== 11 && inss_aliquota !== 3.5) obs.push(OBS_CONFERIR);
  const liquido = r2(v.bruto - v.ir - pis - cofins - csll - v.inss - v.iss_retido);
  const tem = v.ir > 0 || pis > 0 || cofins > 0 || csll > 0 || v.inss > 0;
  return { bruto: v.bruto, ir: v.ir, pis, cofins, csll, inss: v.inss, inss_aliquota, iss_retido: v.iss_retido,
    liquido, liquido_xml: v.liquido_xml, tem_retencao: tem, observacoes: [...new Set(obs)] };
}

export const retencoesDoXml = (xml: string) => calcularRetencoes(lerValoresNfse(xml));
