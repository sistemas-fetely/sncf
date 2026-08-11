/**
 * Parser do Retorno CNAB 400 do Banco Safra (cobrança).
 *
 * Papel: REGISTRO DA RESPOSTA DO BANCO. Não dá baixa em título e não cria
 * movimentação bancária — a baixa é decisão humana e usa outro caminho.
 *
 * Layout medido em 12 arquivos reais (posições 1-based, registro tipo 1).
 */

export interface RetornoSafraOcorrencia {
  linha: number;
  codigo_ocorrencia: string;
  motivo_rejeicao: string | null;
  data_ocorrencia: string | null;
  nosso_numero: string | null;
  uso_empresa: string | null;
  seu_numero: string | null;
  sacado: string | null;
  data_vencimento: string | null;
  valor_titulo: number;
  valor_pago: number;
  valor_juros: number;
  data_credito: string | null;
}

export interface RetornoSafraParsed {
  nro_sequencial: number;
  data_geracao: string | null;
  data_movimento: string | null;
  qtd_registros: number;
  qtd_liquidacoes: number;
  valor_liquidacoes: number;
  ocorrencias: RetornoSafraOcorrencia[];
}

/** Códigos de ocorrência que representam dinheiro entrando (liquidação). */
const CODIGOS_LIQUIDACAO = new Set(["06", "07", "08", "15", "16", "17"]);

/** Recorte por posição 1-based, tolerante a linha curta. */
function pos(linha: string, ini: number, fim: number): string {
  return linha.slice(ini - 1, fim).trim();
}

function num(s: string, casas = 2): number {
  const d = s.replace(/\D/g, "");
  if (!d) return 0;
  return parseInt(d, 10) / Math.pow(10, casas);
}

/** ddmmaa → ISO. 00 ou vazio devolve null. */
function dataDdmmaa(s: string): string | null {
  const d = s.replace(/\D/g, "");
  if (d.length !== 6 || d === "000000") return null;
  const dia = d.slice(0, 2);
  const mes = d.slice(2, 4);
  const ano = parseInt(d.slice(4, 6), 10);
  if (dia === "00" || mes === "00") return null;
  const anoCheio = ano >= 70 ? 1900 + ano : 2000 + ano;
  return `${anoCheio}-${mes}-${dia}`;
}

/** ddmmaaaa → ISO. */
function dataDdmmaaaa(s: string): string | null {
  const d = s.replace(/\D/g, "");
  if (d.length === 6) return dataDdmmaa(d);
  if (d.length !== 8 || d === "00000000") return null;
  const dia = d.slice(0, 2);
  const mes = d.slice(2, 4);
  const ano = d.slice(4, 8);
  if (dia === "00" || mes === "00") return null;
  return `${ano}-${mes}-${dia}`;
}

/** A detecção é pelo conteúdo do header, nunca pelo nome do arquivo. */
export function ehRetornoSafra(texto: string): boolean {
  const primeira = texto.split(/\r\n|\r|\n/)[0] || "";
  return primeira.startsWith("02RETORNO01COBRANCA") && primeira.includes("422SAFRA");
}

/** As últimas 9 posições de qualquer linha trazem a sequência nos 3 primeiros dígitos. */
function sequenciaDaLinha(linha: string): number | null {
  const cauda = linha.slice(-9);
  const m = /^(\d{3})/.exec(cauda);
  return m ? parseInt(m[1], 10) : null;
}

export function parseRetornoSafra(texto: string): RetornoSafraParsed {
  const linhas = texto.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
  if (linhas.length === 0) throw new Error("Arquivo de retorno vazio");

  const header = linhas[0];
  if (!ehRetornoSafra(texto))
    throw new Error(
      "Não é um retorno CNAB 400 do Safra (header precisa começar com 02RETORNO01COBRANCA e conter 422SAFRA)"
    );

  let nro: number | null = null;
  for (const l of linhas) {
    nro = sequenciaDaLinha(l);
    if (nro != null) break;
  }
  if (nro == null)
    throw new Error("Número sequencial do arquivo não encontrado nas últimas 9 posições das linhas");

  const ocorrencias: RetornoSafraOcorrencia[] = [];
  let qtdLiq = 0;
  let valorLiq = 0;

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (pos(l, 1, 1) !== "1") continue;

    const codigo = pos(l, 109, 110);
    const valorTitulo = num(pos(l, 153, 165));
    const valorPago = num(pos(l, 254, 266));

    if (CODIGOS_LIQUIDACAO.has(codigo)) {
      qtdLiq++;
      valorLiq += valorPago;
    }

    ocorrencias.push({
      linha: i + 1,
      codigo_ocorrencia: codigo,
      motivo_rejeicao: pos(l, 105, 107) || null,
      data_ocorrencia: dataDdmmaa(pos(l, 111, 116)),
      nosso_numero: pos(l, 127, 146) || null,
      uso_empresa: pos(l, 38, 62) || null,
      seu_numero: pos(l, 117, 126) || null,
      sacado: pos(l, 301, 334) || null,
      data_vencimento: dataDdmmaa(pos(l, 147, 152)),
      valor_titulo: valorTitulo,
      valor_pago: valorPago,
      valor_juros: num(pos(l, 267, 279)),
      data_credito: dataDdmmaa(pos(l, 296, 301)),
    });
  }

  if (ocorrencias.length === 0)
    throw new Error("Nenhum registro tipo 1 (detalhe) encontrado no arquivo de retorno");

  return {
    nro_sequencial: nro,
    data_geracao: dataDdmmaaaa(pos(header, 95, 100)),
    data_movimento: dataDdmmaaaa(pos(header, 109, 116)),
    qtd_registros: ocorrencias.length,
    qtd_liquidacoes: qtdLiq,
    valor_liquidacoes: Math.round(valorLiq * 100) / 100,
    ocorrencias,
  };
}

/** SHA-256 do conteúdo bruto — chave de idempotência do arquivo. */
export async function hashArquivo(texto: string): Promise<string> {
  const buf = new TextEncoder().encode(texto);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
