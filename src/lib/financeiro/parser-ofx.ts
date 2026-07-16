/**
 * Parser OFX (Open Financial Exchange) - formato dos extratos bancários.
 *
 * Suporta:
 * - OFX 1.x (SGML, com headers tipo "OFXHEADER:100")
 * - OFX 2.x (XML válido)
 * - Conta corrente (BANKMSGSRSV1) e cartão de crédito (CREDITCARDMSGSRSV1)
 *
 * Bibliotecas externas evitadas pra não trazer dependência pesada.
 * Foco no que importa: extrair as transações.
 */

export interface OFXTransacao {
  fitid: string;
  data: string; // YYYY-MM-DD
  valor: number; // positivo entrada, negativo saída
  descricao: string;
  tipo: string; // CREDIT, DEBIT, etc
  memo?: string;
  checknum?: string;
}

export interface OFXResultado {
  banco: {
    codigo?: string;
    agencia?: string;
    conta?: string;
    tipo: "corrente" | "cartao_credito" | "outro";
  };
  periodo: {
    inicio: string | null;
    fim: string | null;
  };
  saldo: {
    inicial: number | null;
    final: number | null;
  };
  transacoes: OFXTransacao[];
  ignoradasSaldo: number;
}


/**
 * Parseia conteúdo do arquivo OFX.
 * Lança erro se o formato for inválido.
 */
export function parsearOFX(conteudo: string): OFXResultado {
  // Limpa BOM e normaliza quebras de linha
  let texto = conteudo.replace(/^\ufeff/, "").replace(/\r\n/g, "\n");

  // Remove header SGML do OFX 1.x (tudo antes de <OFX>)
  const inicioOFX = texto.indexOf("<OFX>");
  if (inicioOFX === -1) {
    throw new Error("Arquivo não parece ser um OFX válido (tag <OFX> não encontrada)");
  }
  texto = texto.substring(inicioOFX);

  // Converte SGML pra XML válido (OFX 1.x não fecha tags pequenas)
  // Estratégia: cada linha que tem <TAG>VALOR sem </TAG>, fecha automaticamente
  const xmlValido = converterSgmlParaXml(texto);

  // Detecta tipo de conta
  const isCartao = xmlValido.includes("<CREDITCARDMSGSRSV1>");
  const tipo = isCartao ? "cartao_credito" : "corrente";

  // Banco
  const codBanco = extrairValor(xmlValido, "BANKID");
  const agencia = extrairValor(xmlValido, "BRANCHID");
  const conta = extrairValor(xmlValido, "ACCTID") || extrairValor(xmlValido, "ACCTID");

  // Período
  const dtStart = extrairData(xmlValido, "DTSTART");
  const dtEnd = extrairData(xmlValido, "DTEND");

  // Saldo
  const saldoFinalRaw = extrairValor(xmlValido, "BALAMT");
  const saldoFinal = saldoFinalRaw ? parseFloat(saldoFinalRaw) : null;

  // Transações: cada <STMTTRN>...</STMTTRN>
  const transacoes: OFXTransacao[] = [];
  let ignoradasSaldo = 0;
  const regexTrn = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/g;
  let match;
  while ((match = regexTrn.exec(xmlValido)) !== null) {
    const bloco = match[1];
    const fitid = extrairValor(bloco, "FITID") || "";
    const data = extrairData(bloco, "DTPOSTED") || "";
    const valorRaw = extrairValor(bloco, "TRNAMT") || "0";
    const valor = parseFloat(valorRaw.replace(",", "."));
    const memoRaw = extrairValor(bloco, "MEMO");
    const nameRaw = extrairValor(bloco, "NAME");
    const descricao = (memoRaw || nameRaw || "").trim();
    const tipoTrn = extrairValor(bloco, "TRNTYPE") || "";
    const checknum = extrairValor(bloco, "CHECKNUM");

    // Dialeto Safra: blocos de saldo entram como STMTTRN. Ignorar.
    const tipoNorm = tipoTrn.toUpperCase().trim();
    const descNorm = (memoRaw || nameRaw || "").toUpperCase().trim();
    if (
      tipoNorm === "BALANCE" ||
      descNorm.startsWith("SALDO TOTAL") ||
      descNorm.startsWith("SALDO INICIAL")
    ) {
      ignoradasSaldo++;
      continue;
    }

    if (fitid && data) {
      transacoes.push({
        fitid,
        data,
        valor,
        descricao: descricao || "(sem descrição)",
        tipo: tipoTrn,
        memo: memoRaw || undefined,
        checknum: checknum || undefined,
      });
    }
  }


  if (transacoes.length === 0) {
    throw new Error(
      "Nenhuma transação encontrada no arquivo. Verifique se é um OFX válido com extrato bancário.",
    );
  }

  return {
    banco: {
      codigo: codBanco || undefined,
      agencia: agencia || undefined,
      conta: conta || undefined,
      tipo,
    },
    periodo: {
      inicio: dtStart,
      fim: dtEnd,
    },
    saldo: {
      inicial: null, // OFX raramente tem saldo inicial - calculado depois
      final: saldoFinal,
    },
    transacoes: transacoes.sort((a, b) => a.data.localeCompare(b.data)),
    ignoradasSaldo,
  };
}


/**
 * Converte SGML do OFX 1.x para XML válido.
 * Trata o caso comum de tags sem fechamento tipo:
 *   <TAG>valor
 * Vira:
 *   <TAG>valor</TAG>
 */
function converterSgmlParaXml(sgml: string): string {
  // Pra cada linha que tem <TAG>VALOR e a próxima linha começa com < (outra tag),
  // fecha a tag automaticamente.
  const linhas = sgml.split("\n");
  const resultado: string[] = [];

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i].trim();
    if (!linha) continue;

    // Match: <TAG>conteúdo (sem </TAG>)
    const m = linha.match(/^<([A-Z0-9_.]+)>(.*)$/);
    if (m) {
      const tag = m[1];
      const valor = m[2];
      // Se NÃO tem fechamento na própria linha, adiciona
      if (valor && !valor.includes(`</${tag}>`)) {
        // Decodifica entidades HTML básicas que aparecem em descrições
        const valorClean = valor
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">");
        resultado.push(`<${tag}>${escapeXml(valorClean)}</${tag}>`);
        continue;
      }
    }
    resultado.push(linha);
  }

  return resultado.join("\n");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Extrai o conteúdo de uma tag (já em formato XML válido).
 */
function extrairValor(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`, "i");
  const m = xml.match(regex);
  if (!m) return null;
  return m[1]
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/**
 * Extrai data no formato OFX (YYYYMMDD ou YYYYMMDDHHMMSS) e retorna YYYY-MM-DD.
 */
function extrairData(xml: string, tag: string): string | null {
  const valor = extrairValor(xml, tag);
  if (!valor) return null;
  // OFX format: YYYYMMDD ou YYYYMMDDHHMMSS[.MS][TZ]
  const m = valor.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}
