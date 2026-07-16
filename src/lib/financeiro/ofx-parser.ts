/**
 * Parser OFX (Open Financial Exchange)
 * Formato exportado por Itaú e Safra (e padrão da maioria dos bancos brasileiros)
 *
 * OFX é XML-like mas não é XML válido — usamos regex.
 */

export interface MovimentacaoOFX {
  data_transacao: string | null;
  descricao: string;
  valor: number;
  tipo: "credito" | "debito";
  id_transacao_banco: string | null;
  saldo_pos_transacao?: number | null;
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

    movimentacoes.push({
      data_transacao: data,
      descricao: (memo || name || "Sem descrição").trim(),
      valor,
      tipo: valor >= 0 ? "credito" : "debito",
      id_transacao_banco: fitId,
    });
  }

  // Extrair saldo final (LEDGERBAL > BALAMT)
  const saldoMatch = text.match(/<BALAMT>([\-\d.,]+)/i);
  const saldo = saldoMatch ? parseFloat(saldoMatch[1].replace(",", ".")) : null;

  return { movimentacoes, saldo, ignoradasSaldo };
}

