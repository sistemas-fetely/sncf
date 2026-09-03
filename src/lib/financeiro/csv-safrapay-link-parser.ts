/**
 * Parser do relatório de Link de Pagamento / SmartCheckout do SafraPay.
 *
 * POR QUE ESTA FONTE IMPORTA MAIS QUE AS OUTRAS: a coluna `Identificação`
 * traz o NÚMERO DO PEDIDO escrito por quem gerou a cobrança. É o único
 * relatório do SafraPay que amarra pagamento a pedido sem palpite por valor.
 * Ficou fora do importador até 03/09/2026, e enquanto isso a amarração
 * NSU ↔ pedido foi feita à mão, um comprovante por vez.
 *
 * DUAS ARMADILHAS DO ARQUIVO, as duas descobertas na primeira importação:
 *
 * 1. NÃO TEM COLUNA `T`. Os layouts Tipo 1/2/3 declaram o tipo na primeira
 *    coluna de cada linha; este declara pelo cabeçalho. O detector antigo
 *    rejeitava com "coluna T ausente e nenhuma assinatura conhecida".
 *
 * 2. ENTIDADE HTML QUEBRA O CSV. As descrições vêm com `&amp;` e `&#x27;`,
 *    que CONTÊM PONTO E VÍRGULA, e o arquivo não usa aspas. Sem desfazer as
 *    entidades ANTES de dividir, as colunas deslocam: o PED-2155 aparecia com
 *    "Aprovada" no campo de id e o PED-2110 com o CNPJ no lugar do nome do
 *    portador. Importar assim gravaria dado torto em silêncio, que é pior que
 *    recusar o arquivo.
 */

export interface SafraPayLinkLinha {
  id_cobranca: string | null;
  id_link: string | null;
  identificacao: string | null;
  /** `PED-XXXX` extraído da identificação — o amarre com `pedidos.id_externo`. */
  pedido_codigo: string | null;
  descricao: string | null;
  tipo_cobranca: string | null;
  status_link: string | null;
  status_cobranca: string | null;
  valor: number | null;
  data_criacao: string | null;
  data_expiracao: string | null;
  data_pagamento: string | null;
  nsu_transacao: string | null;
  portador_nome: string | null;
  portador_documento: string | null;
  cartao_mascarado: string | null;
  cnpj_loja: string | null;
  codigo_loja: string | null;
  mensagem_retorno: string | null;
}

export interface SafraPayLinkParsed {
  linhas: SafraPayLinkLinha[];
  /** Só as pagas — as demais são link expirado, cancelado ou pendente. */
  pagas: number;
  /** Linhas com contagem de colunas fora do esperado, mesmo após reparo. */
  malformadas: number;
}

const COLUNAS_ESPERADAS = 21;

/** Desfaz entidades HTML ANTES de qualquer split — ver armadilha 2 no topo. */
export function repararEntidades(texto: string): string {
  return texto
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Assinatura do cabeçalho: três colunas que só existem neste relatório. */
export function ehRelatorioLinkPagamento(text: string): boolean {
  const primeira = repararEntidades(text).split(/\r\n|\r|\n/)[0] || "";
  const h = primeira.split(";").map(norm).join(";");
  return (
    /IDENTIFICACAO/.test(h) &&
    /ID DO LINK DE PAGAMENTO/.test(h) &&
    /NSU DA TRANSACAO/.test(h)
  );
}

function txt(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}

/** "R$ 2.252,16" → 2252.16 */
function valor(v: string | undefined): number | null {
  const s = (v ?? "").replace("R$", "").trim().replace(/\./g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "2026-09-01 19:32:43Z" → ISO com fuso explícito */
function instante(v: string | undefined): string | null {
  const m = (v ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})Z?$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+00:00` : null;
}

/** "09/01/2026" (MM/DD/AAAA — o relatório usa formato americano) → ISO */
function dataPagamento(v: string | undefined): string | null {
  const m = (v ?? "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

/** "PED - 2146", "Ped-2141", "PED-1780241637062/pg01" → "PED-2146" */
function pedidoCodigo(identificacao: string | null): string | null {
  if (!identificacao) return null;
  const m = identificacao.match(/(\d{4,})/);
  return m ? `PED-${m[1]}` : null;
}

export function parseCsvSafraPayLink(text: string): SafraPayLinkParsed {
  const limpo = repararEntidades(text.replace(/^\uFEFF/, ""));
  const linhasBrutas = limpo.split(/\r\n|\r|\n/).filter((l) => l.trim());
  if (linhasBrutas.length < 2) return { linhas: [], pagas: 0, malformadas: 0 };

  const header = linhasBrutas[0].split(";").map(norm);
  const idx = (nome: string) => header.findIndex((h) => h === norm(nome));

  const iCriacao = idx("Data da criação");
  const iIdent = idx("Identificação");
  const iTipo = idx("Tipo de cobrança");
  const iExpira = idx("Data da expiração");
  const iStatus = idx("Status");
  const iValor = idx("Valor");
  const iIdLink = idx("Id do link de Pagamento");
  const iCnpj = idx("CNPJ");
  const iCodLoja = idx("Código da loja");
  const iDesc = idx("Descrição");
  const iPortador = idx("Nome do portador cartão");
  const iCartao = idx("Número do cartão");
  const iDoc = idx("Documento do portador");
  const iNsu = idx("NSU da transação");
  const iDataPgto = idx("Data do pagamento");
  const iStatusCob = idx("Status da cobrança");
  const iMsg = idx("Mensagem de retorno");
  const iIdCobranca = idx("Id da cobrança");

  const linhas: SafraPayLinkLinha[] = [];
  let malformadas = 0;

  for (const bruta of linhasBrutas.slice(1)) {
    const c = bruta.split(";");
    // FAIL-LOUD: linha com contagem diferente não entra em silêncio.
    if (c.length < COLUNAS_ESPERADAS - 1) {
      malformadas += 1;
      continue;
    }
    const identificacao = txt(c[iIdent]);
    linhas.push({
      id_cobranca: txt(c[iIdCobranca]) ?? txt(c[iIdLink]),
      id_link: txt(c[iIdLink]),
      identificacao,
      pedido_codigo: pedidoCodigo(identificacao),
      descricao: txt(c[iDesc]),
      tipo_cobranca: txt(c[iTipo]),
      status_link: txt(c[iStatus]),
      status_cobranca: txt(c[iStatusCob]),
      valor: valor(c[iValor]),
      data_criacao: instante(c[iCriacao]),
      data_expiracao: instante(c[iExpira]),
      data_pagamento: dataPagamento(c[iDataPgto]),
      nsu_transacao: txt(c[iNsu]),
      portador_nome: txt(c[iPortador]),
      portador_documento: txt(c[iDoc]),
      cartao_mascarado: txt(c[iCartao]),
      cnpj_loja: txt(c[iCnpj]),
      codigo_loja: txt(c[iCodLoja]),
      mensagem_retorno: txt(c[iMsg]),
    });
  }

  return {
    linhas,
    pagas: linhas.filter((l) => l.status_link === "Pago").length,
    malformadas,
  };
}
