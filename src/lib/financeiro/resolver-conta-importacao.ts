/**
 * CONTA-VEM-DO-ARQUIVO (08/09/2026)
 *
 * O seletor manual de conta na tela de importação mandou 89 movimentações do
 * Mercado Pago para o Safra. A conta não é escolha do operador: ela está no
 * arquivo (cabeçalho OFX) ou na dimensão `importacao_fonte_conta`.
 *
 * Ordem: cabeçalho OFX > mapeamento da fonte > REJEITA.
 * Nunca existe conta padrão. Nunca existe fallback silencioso.
 *
 * CADASTRO-INCOMPLETO-NAO-E-DIVERGENCIA (09/09/2026)
 * OFX legítimo do Safra era recusado porque as contas cadastradas tinham
 * `agencia` e `numero_conta` NULL e a comparação exigia a tríade inteira.
 * Campo vazio no CADASTRO agora é curinga; campo divergente continua matando o
 * casamento. A resolução é uma cascata: tríade > banco+conta > banco único.
 */

export interface ContaBancariaResolucao {
  id: string;
  nome_exibicao: string;
  banco_codigo: string | null;
  agencia: string | null;
  numero_conta: string | null;
  /** Quando ausente, a conta é tratada como ativa. */
  ativo?: boolean | null;
}

export interface CabecalhoOFX {
  bankid: string | null;
  branchid: string | null;
  acctid: string | null;
}

/** Passo da cascata que resolveu — entra no veredito para auditoria visual. */
export type PassoResolucao = "triade" | "banco_e_conta" | "banco_unico";

export interface ResolucaoConta {
  conta: ContaBancariaResolucao;
  passo: PassoResolucao;
  /**
   * APRENDIZADO: valores que o arquivo declara e o cadastro não tem.
   * Quem chama grava no cadastro — é o banco declarando o próprio número.
   */
  completar: { agencia?: string; numero_conta?: string };
}

/** Só dígitos, sem zeros à esquerda. Isso resolve DV com e sem hífen. */
export function digitos(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = String(v).replace(/\D/g, "").replace(/^0+/, "");
  return d.length > 0 ? d : null;
}

/**
 * Mesma conta com e sem dígito verificador.
 * NÃO compara "os dois sem o último dígito": 12345-6 e 12345-7 são contas
 * diferentes e cair nisso era justamente o erro de conta trocada.
 *
 * Retorno: true = casa, false = divergente, null = indecidível (falta dado).
 */
function contaCombina(doArquivo: string | null, doCadastro: string | null): boolean | null {
  if (!doArquivo || !doCadastro) return null; // sem dado dos dois lados: não decide
  if (doArquivo === doCadastro) return true;
  if (doArquivo === doCadastro.slice(0, -1) || doCadastro === doArquivo.slice(0, -1)) return true;
  return false;
}

function ehAtiva(c: ContaBancariaResolucao): boolean {
  return c.ativo !== false;
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

function completarCom(
  conta: ContaBancariaResolucao,
  ag: string | null,
  cc: string | null
): { agencia?: string; numero_conta?: string } {
  const completar: { agencia?: string; numero_conta?: string } = {};
  if (ag && !digitos(conta.agencia)) completar.agencia = ag;
  if (cc && !digitos(conta.numero_conta)) completar.numero_conta = cc;
  return completar;
}

/**
 * Resolve o cabeçalho OFX contra as contas cadastradas, em cascata.
 * Só devolve conta quando a identificação é ÚNICA — empate é não-resolução.
 */
export function resolverContaPorCabecalhoOFX(
  cab: CabecalhoOFX,
  contas: ContaBancariaResolucao[]
): ResolucaoConta | null {
  const banco = digitos(cab.bankid);
  const ag = digitos(cab.branchid);
  const cc = digitos(cab.acctid);
  if (!banco && !cc) return null;

  const ativas = contas.filter(ehAtiva);

  const doBanco = banco
    ? ativas.filter((c) => contaCombina(banco, digitos(c.banco_codigo)) === true)
    : ativas;

  // 1. Tríade completa — nenhum campo divergente e agência e conta batendo.
  const triade = doBanco.filter(
    (c) =>
      contaCombina(cc, digitos(c.numero_conta)) === true &&
      contaCombina(ag, digitos(c.agencia)) === true
  );
  if (triade.length === 1) {
    return { conta: triade[0], passo: "triade", completar: {} };
  }

  // 2. Banco + conta (agência ausente no arquivo ou no cadastro é curinga).
  const bancoEConta = doBanco.filter(
    (c) =>
      contaCombina(cc, digitos(c.numero_conta)) === true &&
      contaCombina(ag, digitos(c.agencia)) !== false
  );
  if (bancoEConta.length === 1) {
    return {
      conta: bancoEConta[0],
      passo: "banco_e_conta",
      completar: completarCom(bancoEConta[0], ag, cc),
    };
  }

  // 3. Banco sozinho — só quando existe exatamente UMA conta ativa do banco e
  // nada no cadastro contradiz o arquivo.
  if (banco) {
    const compativeis = doBanco.filter(
      (c) =>
        contaCombina(cc, digitos(c.numero_conta)) !== false &&
        contaCombina(ag, digitos(c.agencia)) !== false
    );
    if (doBanco.length === 1 && compativeis.length === 1) {
      return {
        conta: compativeis[0],
        passo: "banco_unico",
        completar: completarCom(compativeis[0], ag, cc),
      };
    }
  }

  return null;
}

/** Frase que a recusa acrescenta: o que existe cadastrado para aquele banco. */
export function explicarContasDoBanco(
  cab: CabecalhoOFX,
  contas: ContaBancariaResolucao[]
): string {
  const banco = digitos(cab.bankid);
  const ativas = contas.filter(ehAtiva);
  const doBanco = banco
    ? ativas.filter((c) => contaCombina(banco, digitos(c.banco_codigo)) === true)
    : [];
  const lista =
    doBanco.length > 0
      ? doBanco
          .map(
            (c) =>
              `${c.nome_exibicao} (ag ${c.agencia || "—"} / conta ${c.numero_conta || "—"})`
          )
          .join("; ")
      : "nenhuma";
  return `Contas ativas cadastradas para o banco ${cab.bankid ?? "—"}: ${lista}. Complete agência/conta em /parametros ou cadastre a conta.`;
}

/** Frase do aprendizado automático, para o veredito por arquivo. */
export function descreverCompletados(
  nomeConta: string,
  completar: { agencia?: string; numero_conta?: string }
): string | undefined {
  const partes: string[] = [];
  if (completar.agencia) partes.push(`agência ${completar.agencia}`);
  if (completar.numero_conta) partes.push(`conta ${completar.numero_conta}`);
  if (partes.length === 0) return undefined;
  return `Conta ${nomeConta} completada com ${partes.join(" / ")} a partir do arquivo.`;
}
