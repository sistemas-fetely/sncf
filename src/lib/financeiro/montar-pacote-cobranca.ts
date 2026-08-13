/**
 * Montador ÚNICO do pacote de cobrança (NF + boletos) usado pela Mesa e pela Régua.
 *
 * Regra: a base do pacote são SÓ os títulos com `status = 'aberto'`.
 * Parcela paga ou cancelada não entra em nada — nem anexo, nem corpo do e-mail,
 * nem soma de valores. Boleto só para título aberto com `tipo_pagamento = 'boleto'`.
 * Cartão/pix não têm boleto e por isso não passam pelo guard de linha digitável.
 */

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function fmtDataBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  if (!y || !m || !d) return String(iso);
  return `${d}/${m}/${y}`;
}

export interface TituloPacote {
  id: string;
  numero_parcela: number | null;
  total_parcelas: number | null;
  data_vencimento_atual: string | null;
  valor_bruto: number | null;
  status: string | null;
  tipo_pagamento: string | null;
  boleto_status: string | null;
  linha_digitavel: string | null;
  pix_txid?: string | null;
  pix_qr_url?: string | null;
  pix_token?: string | null;
  link_pagamento?: string | null;
}

export interface BoletoPacote {
  titulo_id: string;
  numero_parcela: number | null;
  parcela: string;
  vencimento: string;
  valor: string;
  linha_digitavel: string | null;
}

export interface PixPacote {
  titulo_id: string;
  numero_parcela: number | null;
  parcela: string;
  vencimento: string;
  valor: string;
  pix_txid: string | null;
  qr_code_pix: string | null;
  link_pagina_pagamento: string | null;
  link_pagamento: string | null;
}

export interface PacoteCobranca {
  /** Títulos com status 'aberto' — a base de tudo. */
  abertos: TituloPacote[];
  /** Subconjunto de `abertos` cujo tipo_pagamento é boleto. */
  titulosBoleto: TituloPacote[];
  /** Subconjunto de `abertos` cujo tipo_pagamento é pix. */
  titulosPix: TituloPacote[];
  /** Lista formatada para o corpo do e-mail (só boletos abertos). */
  boletos: BoletoPacote[];
  /** Lista formatada para o corpo do e-mail (só pix abertos). */
  pix: PixPacote[];
  temBoleto: boolean;
  temPix: boolean;
  /** Instrumentos presentes nos títulos abertos: 'boleto' | 'cartao' | 'pix' | ... */
  instrumentos: string[];
  /** Frase para o corpo do e-mail quando não há boleto a pagar. */
  instrumentoTexto: string | null;
  /** Soma dos títulos abertos. */
  totalAberto: number;
}


const ENVIAVEIS = new Set(["registrado", "remessa_gerada"]);

const ROTULO_INSTRUMENTO: Record<string, string> = {
  cartao: "cartão",
  cartao_credito: "cartão de crédito",
  pix: "Pix",
  boleto: "boleto",
  transferencia: "transferência",
  dinheiro: "dinheiro",
};

function rotulo(tipo: string): string {
  return ROTULO_INSTRUMENTO[tipo] ?? tipo.replace(/_/g, " ");
}

/**
 * Monta o pacote e aplica os guards. Lança Error com mensagem pronta para o operador.
 */
export function montarPacoteCobranca(titulos: TituloPacote[]): PacoteCobranca {
  const abertos = (titulos ?? []).filter((t) => (t.status ?? "").toLowerCase() === "aberto");

  if (abertos.length === 0) {
    throw new Error("Nada a cobrar neste pedido — todas as parcelas já foram quitadas.");
  }

  const titulosBoleto = abertos
    .filter((t) => (t.tipo_pagamento ?? "").toLowerCase() === "boleto")
    .sort((a, b) => (a.numero_parcela ?? 0) - (b.numero_parcela ?? 0));

  // Guard de linha digitável: SÓ para título aberto de boleto.
  const pendentes = titulosBoleto.filter(
    (t) => !ENVIAVEIS.has(t.boleto_status ?? "") || !t.linha_digitavel,
  );
  if (pendentes.length > 0) {
    const vencido = pendentes.find((t) => t.boleto_status === "vencido");
    const rejeitado = pendentes.find((t) => t.boleto_status === "rejeitado");
    if (vencido) {
      throw new Error(
        `Boleto vencido (parcela ${vencido.numero_parcela}) — o boleto Safra não é pagável após o vencimento. Reemita o boleto com nova data antes de enviar ao cliente.`,
      );
    }
    if (rejeitado) {
      throw new Error(
        `Boleto rejeitado pelo banco (parcela ${rejeitado.numero_parcela}) — corrija os dados e gere nova remessa.`,
      );
    }
    const bloqueio = pendentes[0];
    if (!bloqueio.linha_digitavel) {
      throw new Error(
        `Parcela ${bloqueio.numero_parcela} sem linha digitável — gere a remessa Safra antes de enviar.`,
      );
    }
    throw new Error(
      "Há boletos sem remessa gerada neste pedido — gere a remessa Safra antes de enviar.",
    );
  }

  const boletos: BoletoPacote[] = titulosBoleto.map((t) => ({
    titulo_id: t.id,
    numero_parcela: t.numero_parcela,
    parcela: `${t.numero_parcela ?? "—"}/${t.total_parcelas ?? "—"}`,
    vencimento: fmtDataBR(t.data_vencimento_atual),
    valor: fmtBRL.format(Number(t.valor_bruto ?? 0)),
    linha_digitavel: t.linha_digitavel,
  }));

  const instrumentos = Array.from(
    new Set(abertos.map((t) => (t.tipo_pagamento ?? "").toLowerCase()).filter(Boolean)),
  );

  const semBoleto = instrumentos.filter((i) => i !== "boleto");
  const instrumentoTexto =
    boletos.length === 0 && semBoleto.length > 0
      ? `A cobrança deste pedido é ${semBoleto.map(rotulo).join(" / ")} — não há boleto a pagar.`
      : null;

  return {
    abertos,
    titulosBoleto,
    boletos,
    temBoleto: boletos.length > 0,
    instrumentos,
    instrumentoTexto,
    totalAberto: abertos.reduce((s, t) => s + Number(t.valor_bruto ?? 0), 0),
  };
}
