/**
 * CONTA-VEM-DO-ARQUIVO (08/09/2026)
 *
 * O seletor manual de conta na tela de importação mandou 89 movimentações do
 * Mercado Pago para o Safra. A conta não é escolha do operador: ela está no
 * arquivo (cabeçalho OFX) ou na dimensão `importacao_fonte_conta`.
 *
 * Ordem: cabeçalho OFX > mapeamento da fonte > REJEITA.
 * Nunca existe conta padrão. Nunca existe fallback silencioso.
 */

export interface ContaBancariaResolucao {
  id: string;
  nome_exibicao: string;
  banco_codigo: string | null;
  agencia: string | null;
  numero_conta: string | null;
}

export interface CabecalhoOFX {
  bankid: string | null;
  branchid: string | null;
  acctid: string | null;
}

/** Só dígitos, sem zeros à esquerda. Isso resolve DV com e sem hífen. */
export function digitos(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = String(v).replace(/\D/g, "").replace(/^0+/, "");
  return d.length > 0 ? d : null;
}

/** Mesma conta com e sem dígito verificador: compara também sem o último dígito. */
function contaCombina(doArquivo: string | null, doCadastro: string | null): boolean | null {
  if (!doArquivo || !doCadastro) return null; // sem dado dos dois lados: não decide
  if (doArquivo === doCadastro) return true;
  const semDvA = doArquivo.slice(0, -1);
  const semDvB = doCadastro.slice(0, -1);
  return doArquivo === semDvB || doCadastro === semDvA || (semDvA.length > 0 && semDvA === semDvB);
}

function tagOFX(texto: string, tag: string): string | null {
  const m = texto.match(new RegExp("<" + tag + ">([^<\\n\\r]+)", "i"));
  return m ? m[1].trim() : null;
}

/** Lê BANKID / BRANCHID / ACCTID do cabeçalho da conta no OFX. */
export function extrairCabecalhoOFX(texto: string): CabecalhoOFX {
  const bloco =
    texto.match(/<BANKACCTFROM>([\s\S]*?)<\/BANKACCTFROM>/i)?.[1] ||
    texto.match(/<CCACCTFROM>([\s\S]*?)<\/CCACCTFROM>/i)?.[1] ||
    texto;
  return {
    bankid: tagOFX(bloco, "BANKID"),
    branchid: tagOFX(bloco, "BRANCHID"),
    acctid: tagOFX(bloco, "ACCTID"),
  };
}

export function descreverCabecalho(cab: CabecalhoOFX): string {
  return `banco ${cab.bankid ?? "—"}, agência ${cab.branchid ?? "—"}, conta ${cab.acctid ?? "—"}`;
}

/**
 * Resolve o cabeçalho OFX contra as contas cadastradas.
 * Só devolve conta quando a identificação é ÚNICA — empate é não-resolução.
 */
export function resolverContaPorCabecalhoOFX(
  cab: CabecalhoOFX,
  contas: ContaBancariaResolucao[]
): ContaBancariaResolucao | null {
  const banco = digitos(cab.bankid);
  const ag = digitos(cab.branchid);
  const cc = digitos(cab.acctid);
  if (!banco && !cc) return null;

  let candidatas = contas;

  if (banco) {
    candidatas = candidatas.filter((c) => {
      const b = digitos(c.banco_codigo);
      return b !== null && b === banco;
    });
  }

  // Conta e agência só filtram quando os dois lados têm o dado.
  const porConta = candidatas.filter((c) => contaCombina(cc, digitos(c.numero_conta)) === true);
  if (porConta.length > 0) candidatas = porConta;

  const porAgencia = candidatas.filter((c) => contaCombina(ag, digitos(c.agencia)) === true);
  if (porAgencia.length > 0) candidatas = porAgencia;

  return candidatas.length === 1 ? candidatas[0] : null;
}
