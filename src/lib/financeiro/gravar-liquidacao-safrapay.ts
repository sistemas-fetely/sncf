/**
 * UMA-GRAVACAO-DOIS-FORMATOS (02/09/2026)
 *
 * A composição do repasse de cartão SafraPay chega em dois arquivos diferentes
 * — o CSV Tipo 2 ("Realizado") e o XLSX "Recebíveis de Vendas". Os dois dizem a
 * MESMA coisa: qual NSU, qual parcela e qual taxa compõem o lote que o extrato
 * mostra como um crédito único `RESUMO VENDAS CARTAO`.
 *
 * Por isso a gravação é UMA só. Cada parser normaliza o seu formato para
 * `LinhaLiquidacaoSafraPay` e chama daqui. Regra de vínculo com o extrato:
 * dia com EXATAMENTE UM lote → vincula; dia com vários → nulo. Rateio de lote
 * é decisão humana, não palpite de parser.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export interface LinhaLiquidacaoSafraPay {
  nsu: string | null;
  parcela: number | null;
  total_parcelas: number | null;
  /** DT EFETIVA — dia em que o dinheiro caiu na conta. ISO. */
  data_pagamento: string | null;
  data_prevista?: string | null;
  data_venda?: string | null;
  valor_bruto_parcela: number | null;
  valor_liquido: number | null;
  bandeira?: string | null;
  modalidade?: string | null;
  terminal?: string | null;
  ec?: string | null;
  anomes?: string | null;
  cartao_mascarado?: string | null;
  autorizacao?: string | null;
}

export type ResultadoLiquidacao =
  | "nova"
  | "duplicada"
  | "sem_identificador"
  | "sem_data";

/** NSU vem do arquivo como `'17641614255` — a aspa é do CSV, não do dado. */
export function limparNsu(bruto: string | null | undefined): string | null {
  const s = String(bruto ?? "").replace(/^'+/, "").trim();
  return s || null;
}

/**
 * Um lote por dia, ou nada. Consulta o extrato uma vez por data distinta.
 */
export async function resolverLotesDoDia(
  sb: Client,
  conta: string,
  dias: string[]
): Promise<Map<string, string | null>> {
  const mapa = new Map<string, string | null>();
  for (const dia of Array.from(new Set(dias.filter(Boolean)))) {
    const { data: lotes, error } = await sb
      .from("movimentacoes_bancarias")
      .select("id")
      .eq("conta_bancaria_id", conta)
      .eq("data_transacao", dia)
      .eq("tipo", "credito")
      .ilike("descricao", "RESUMO VENDAS CARTAO%")
      .limit(3);
    if (error) throw error;
    mapa.set(dia, (lotes || []).length === 1 ? lotes[0].id : null);
  }
  return mapa;
}

export interface ContextoGravacaoLiquidacao {
  conta: string;
  impId: string | null;
  origem: "safrapay_tipo2" | "safrapay_recebiveis";
  loteDoDia: Map<string, string | null>;
}

/**
 * Grava uma parcela liquidada. `taxa_mdr` só existe quando bruto e líquido
 * existem — taxa inventada é pior que taxa ausente.
 */
export async function gravarLiquidacaoSafraPay(
  sb: Client,
  l: LinhaLiquidacaoSafraPay,
  ctx: ContextoGravacaoLiquidacao
): Promise<ResultadoLiquidacao> {
  const nsu = limparNsu(l.nsu);
  if (!nsu) return "sem_identificador";
  if (!l.data_pagamento) return "sem_data";

  const taxa =
    l.valor_bruto_parcela != null && l.valor_liquido != null
      ? Number((l.valor_bruto_parcela - l.valor_liquido).toFixed(2))
      : null;

  const { data: inseridas, error } = await sb
    .from("safrapay_liquidacao")
    .upsert(
      [
        {
          nsu,
          parcela: l.parcela,
          total_parcelas: l.total_parcelas ?? null,
          data_pagamento: l.data_pagamento,
          data_prevista: l.data_prevista ?? null,
          data_venda: l.data_venda ?? null,
          valor_bruto_parcela: l.valor_bruto_parcela,
          valor_liquido: l.valor_liquido,
          taxa_mdr: taxa,
          bandeira: l.bandeira ?? null,
          modalidade: l.modalidade ?? null,
          terminal: l.terminal ?? null,
          ec: l.ec ?? null,
          anomes: l.anomes ?? null,
          cartao_mascarado: l.cartao_mascarado ?? null,
          autorizacao: l.autorizacao ?? null,
          movimentacao_id: ctx.loteDoDia.get(l.data_pagamento) ?? null,
          fonte_importacao_id: ctx.impId,
          origem: ctx.origem,
        },
      ],
      { onConflict: "nsu,parcela,data_pagamento", ignoreDuplicates: true }
    )
    .select("id");

  if (error) throw error;
  return (inseridas || []).length > 0 ? "nova" : "duplicada";
}
