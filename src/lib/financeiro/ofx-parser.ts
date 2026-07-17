/**
 * Parser OFX (Open Financial Exchange)
 * Formato exportado por Itaú e Safra (e padrão da maioria dos bancos brasileiros)
 *
 * OFX é XML-like mas não é XML válido — usamos regex.
 */

export type TipoMeio =
  | "pix"
  | "ted"
  | "tarifa"
  | "rendimento"
  | "imposto"
  | "boleto"
  | "outro";

export interface MovimentacaoOFX {
  data_transacao: string | null;
  descricao: string;
  valor: number;
  tipo: "credito" | "debito";
  id_transacao_banco: string | null;
  saldo_pos_transacao?: number | null;
  contraparte_nome?: string | null;
  contraparte_documento?: string | null;
  tipo_meio?: TipoMeio | null;
}

export interface OFXParsed {
  movimentacoes: MovimentacaoOFX[];
  saldo: number | null;
  ignoradasSaldo: number;
}

function extrairTag(bloco: string, tag: string): string | null {
  const regex = new RegExp("<" + tag + ">([^<\\n\\r]+)", "i");
  const match = bloco.match(regex);
  return match ? match[1].trim() : null;
}

const RE_CNPJ = /(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/;
const RE_CPF = /(\d{3}\.\d{3}\.\d{3}-\d{2})/;

const PREFIXOS_LIMPAR = [
  "PIX QR CODE RECEBIDO",
  "PIX QR CODE ENVIADO",
  "PIX QR CODE",
  "PIX TRANSF ENVIADA",
  "PIX TRANSF RECEBIDA",
  "PIX TRANSF",
  "PIX RECEBIDO",
  "PIX ENVIADO",
  "PIX",
  "TED RECEBIDO",
  "TED ENVIADO",
  "TED",
  "DOC RECEBIDO",
  "DOC ENVIADO",
  "DOC",
  "SISPAG",
];

function detectarTipoMeio(memo: string): TipoMeio {
  const s = memo.toUpperCase();
  if (/\bTAR\b|TARIFA/.test(s)) return "tarifa";
  if (/\bPIX\b/.test(s)) return "pix";
  if (/\bTED\b|\bDOC\b/.test(s)) return "ted";
  if (/\bREND\b|APLIC/.test(s)) return "rendimento";
  if (/SISPAG TRIBUTOS|\bDARF\b|\bDARE\b|SEFAZ/.test(s)) return "imposto";
  if (/BOLETO|COBRANCA|COBRANÇA/.test(s)) return "boleto";
  return "outro";
}


function extrairContraparte(memo: string): {
  nome: string | null;
  documento: string | null;
} {
  if (!memo) return { nome: null, documento: null };

  let docRaw: string | null = null;
  let docIndex = -1;
  const mCnpj = memo.match(RE_CNPJ);
  const mCpf = memo.match(RE_CPF);
  if (mCnpj && mCnpj.index != null) {
    docRaw = mCnpj[1];
    docIndex = mCnpj.index;
  } else if (mCpf && mCpf.index != null) {
    docRaw = mCpf[1];
    docIndex = mCpf.index;
  }

  if (!docRaw || docIndex < 0) return { nome: null, documento: null };

  const documento = docRaw.replace(/\D/g, "");
  // Aceitar 11 (CPF) ou 14 (CNPJ) dígitos
  if (documento.length !== 11 && documento.length !== 14) {
    return { nome: null, documento: null };
  }

  // Nome = trecho antes do documento
  let antes = memo.substring(0, docIndex).trim();

  // Remover prefixos conhecidos (case-insensitive, no início)
  const upper = antes.toUpperCase();
  for (const p of PREFIXOS_LIMPAR) {
    if (upper.startsWith(p)) {
      antes = antes.substring(p.length).trim();
      break;
    }
  }

  // Remover datas curtas tipo C23/06, 25/06, C25/06
  antes = antes
    .replace(/\bC?\d{2}\/\d{2}(\/\d{2,4})?\b/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Remover códigos isolados curtos no início (ex: "CAC" separado)
  // Heurística: se o nome ficou muito curto, deixar null
  if (antes.length < 3) return { nome: null, documento };

  return { nome: antes.substring(0, 200), documento };
}

export function parseOFX(text: string): OFXParsed {
  const movimentacoes: MovimentacaoOFX[] = [];
  let ignoradasSaldo = 0;

  // Cada transação fica entre <STMTTRN> e </STMTTRN>
  const regex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const bloco = match[1];

    const dtPosted = extrairTag(bloco, "DTPOSTED");
    const trnAmt = extrairTag(bloco, "TRNAMT");
    const fitId = extrairTag(bloco, "FITID");
    const memo = extrairTag(bloco, "MEMO");
    const name = extrairTag(bloco, "NAME");
    const trnType = extrairTag(bloco, "TRNTYPE");

    // Dialeto Safra: blocos de saldo entram como STMTTRN. Ignorar.
    const trnTypeNorm = (trnType || "").toUpperCase().trim();
    const descNorm = (memo || name || "").toUpperCase().trim();
    if (
      trnTypeNorm === "BALANCE" ||
      descNorm.startsWith("SALDO TOTAL") ||
      descNorm.startsWith("SALDO INICIAL")
    ) {
      ignoradasSaldo++;
      continue;
    }

    const valor = parseFloat((trnAmt || "0").replace(",", ".")) || 0;
    const dataStr = dtPosted ? dtPosted.substring(0, 8) : null;
    const data =
      dataStr && dataStr.length === 8
        ? `${dataStr.substring(0, 4)}-${dataStr.substring(4, 6)}-${dataStr.substring(6, 8)}`
        : null;

    const memoCompleto = (memo || name || "").trim();
    const { nome: contraparte_nome, documento: contraparte_documento } =
      extrairContraparte(memoCompleto);
    const tipo_meio = detectarTipoMeio(memoCompleto);

    movimentacoes.push({
      data_transacao: data,
      descricao: memoCompleto || "Sem descrição",
      valor,
      tipo: valor >= 0 ? "credito" : "debito",
      id_transacao_banco: fitId,
      contraparte_nome,
      contraparte_documento,
      tipo_meio,
    });
  }

  // Extrair saldo final (LEDGERBAL > BALAMT)
  const saldoMatch = text.match(/<BALAMT>([\-\d.,]+)/i);
  const saldo = saldoMatch ? parseFloat(saldoMatch[1].replace(",", ".")) : null;

  return { movimentacoes, saldo, ignoradasSaldo };
}
