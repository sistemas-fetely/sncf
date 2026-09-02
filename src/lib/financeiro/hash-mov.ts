/**
 * Identidade de movimentação bancária (anti-duplicata).
 *
 * ┌─ POR QUE ISSO NÃO PODE SER "SIMPLIFICADO" ────────────────────────────────┐
 * O OFX do Safra entrega o MESMO lançamento com identificadores diferentes em
 * extratos diferentes. Casos medidos no banco:
 *
 *  • PIX do CASA DOCE, 28/08, R$ 738,96:
 *      arquivo de 29/08 → id `E60701190202608281355DY56QSGO9DZ` (EndToEnd)
 *      arquivo de 01/09 → id `08281` (sequencial do dia)
 *
 *  • Crédito de R$ 3.101,68 em 31/08:
 *      arquivo de 31/08 → `08313`
 *      arquivo de 01/09 → `08312`   (uma linha anterior mudou de posição)
 *
 * Ou seja: o sequencial do dia NÃO é identidade — ele se desloca. Incluir esse
 * número no hash fazia cada reimportação de período sobreposto criar linha nova
 * (22 lançamentos duplicados: R$ 1.019.569,95 em crédito, R$ 13.447,59 em
 * débito). Reimportar extrato é rotina diária. NÃO volte a usar o sequencial.
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * Regra, em ordem de precedência:
 *  1. MODO_ENDTOEND  — identificador casa `^E.{31}$`: a identidade é ele.
 *  2. MODO_CONTEUDO  — sem EndToEnd: conta + data + valor + tipo + descrição
 *                      normalizada. O sequencial do dia fica de fora.
 */

export type ModoHashMov = "endtoend" | "conteudo";

/** EndToEnd do SPI: "E" + 31 caracteres (32 no total). */
export const RE_ENDTOEND = /^E.{31}$/;

export function ehEndToEnd(id: string | null | undefined): boolean {
  return !!id && RE_ENDTOEND.test(id.trim());
}

/**
 * Caixa alta, sem acento, espaços colapsados e sem o sufixo numérico de
 * sequencial que o banco às vezes anexa na descrição ("... 08313").
 */
export function normalizarDescricaoMov(descricao: string): string {
  return (descricao || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[\s\u00a0]+/g, " ")
    .trim()
    .replace(/[\s-]+\d{4,6}$/, "")
    .trim();
}

async function sha256(base: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = new TextEncoder().encode(base);
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  let h = 0;
  for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) | 0;
  return String(h);
}

/**
 * Hash genérico (safrapay, mercado pago, itaú, boletos...).
 * Comportamento inalterado de propósito: essas fontes têm identificador estável
 * próprio e já têm milhares de linhas gravadas com esta fórmula.
 */
export async function gerarHashMov(
  contaId: string,
  data: string,
  valor: number,
  descricao: string,
  fitid?: string
): Promise<string> {
  const base = fitid
    ? `${contaId}|${fitid}|${valor.toFixed(2)}`
    : `${contaId}|${data}|${valor.toFixed(2)}|${descricao.trim().toLowerCase()}`;
  return sha256(base);
}

/** MODO_ENDTOEND — mesma fórmula histórica do caminho FITID, para casar com as
 *  linhas já gravadas (inclusive as vindas do XLSX de PIX do Safra). */
export async function hashOfxPorEndToEnd(
  contaId: string,
  valor: number,
  endToEnd: string
): Promise<string> {
  return sha256(`${contaId}|${endToEnd.trim()}|${valor.toFixed(2)}`);
}

/** MODO_CONTEUDO — sem EndToEnd. Nunca inclui o sequencial do dia. */
export async function hashOfxPorConteudo(
  contaId: string,
  data: string,
  valor: number,
  tipo: string,
  descricao: string
): Promise<string> {
  return sha256(
    `ofx-conteudo|${contaId}|${data}|${valor.toFixed(2)}|${tipo}|${normalizarDescricaoMov(descricao)}`
  );
}

export type IdentidadeOfx = {
  hash: string;
  modo: ModoHashMov;
  /** Hash da fórmula antiga (sequencial no lugar do EndToEnd). Só para
   *  RECONHECER linhas já gravadas antes da correção — nunca para gravar. */
  hashLegado: string | null;
};

/**
 * Identidade de uma linha de OFX. Dois modos nomeados, sem `if` escondido.
 */
export async function identidadeMovOfx(params: {
  contaId: string;
  data: string;
  valor: number;
  tipo: string;
  descricao: string;
  idTransacaoBanco?: string | null;
}): Promise<IdentidadeOfx> {
  const { contaId, data, valor, tipo, descricao, idTransacaoBanco } = params;

  if (ehEndToEnd(idTransacaoBanco)) {
    return {
      hash: await hashOfxPorEndToEnd(contaId, valor, idTransacaoBanco!.trim()),
      modo: "endtoend",
      hashLegado: null,
    };
  }

  const hash = await hashOfxPorConteudo(contaId, data, valor, tipo, descricao);
  // Linhas gravadas antes desta correção usaram o sequencial (ou a descrição
  // crua) como chave. Reconhecê-las evita uma nova onda de cópias.
  const hashLegado = await gerarHashMov(
    contaId,
    data,
    valor,
    descricao,
    idTransacaoBanco || undefined
  );
  return { hash, modo: "conteudo", hashLegado };
}
