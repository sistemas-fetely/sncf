/** Quem recebe POSIÇÃO na competência: carteira viva menos quem tem extrato com valor > 0. */
export type PosicaoViva = {
  vendedor_id: string | null;
  representante: string | null;
  email_contato: string | null;
  carteira_total: number | null;
  em_atraso: number | null;
  em_atraso_qtd: number | null;
};
export type EnvioPosicao = { vendedor_id: string; enviado_em: string | null };
export type LinhaPosicao = PosicaoViva & { vendedor_id: string; enviado_em: string | null };

export function quemRecebePosicao(
  vivas: PosicaoViva[],
  extratos: { vendedor_id: string | null; valor_total: number | null }[],
  envios: EnvioPosicao[],
): LinhaPosicao[] {
  const comExtrato = new Set(extratos.filter((e) => Number(e.valor_total ?? 0) > 0).map((e) => e.vendedor_id));
  const enviado = new Map(envios.map((e) => [e.vendedor_id, e.enviado_em]));
  return vivas
    .filter((v): v is PosicaoViva & { vendedor_id: string } => !!v.vendedor_id && !comExtrato.has(v.vendedor_id))
    .map((v) => ({ ...v, enviado_em: enviado.get(v.vendedor_id) ?? null }))
    .sort((a, b) => (a.representante ?? "").localeCompare(b.representante ?? "", "pt-BR"));
}
